import {
  UnknownWorkspaceError,
  WORKSPACE_LIST_NAMES,
  type LegacyStateImport,
  type StoredWorkspace,
  type StoredWorkspaceContents,
  type WorkspaceListName,
  type WorkspaceStorePort,
} from '@mdx/platform';
import { tauriCommands, type StoredWorkspaceReply } from './tauriCommands';

export class TauriWorkspaceStore implements WorkspaceStorePort {
  async importLegacyState({
    workspace,
    lists,
    windowId,
    windowSession,
    appValues,
  }: LegacyStateImport): Promise<void> {
    await tauriCommands.importLegacyState({
      workspace,
      lists: jsonTextOf(lists),
      windowId,
      windowSession: JSON.stringify(windowSession),
      appValues: jsonTextOf(appValues),
    });
  }

  async clearAll(): Promise<void> {
    await tauriCommands.clearWorkspaces();
  }

  async loadRegistry(): Promise<StoredWorkspace[]> {
    const rows = await tauriCommands.loadWorkspaceRegistry();
    return rows.map(({ kindData, ...workspace }) => ({
      ...workspace,
      ...(kindData === null || kindData === undefined ? {} : { kindData: parsedOrNull(kindData) }),
    }));
  }

  async loadWorkspace(workspaceId: string, windowId: string): Promise<StoredWorkspaceContents | undefined> {
    const reply = await tauriCommands.loadWorkspace(workspaceId, windowId);
    return reply === null ? undefined : contentsOf(reply);
  }

  async saveWorkspace({ kindData, ...workspace }: StoredWorkspace): Promise<void> {
    await tauriCommands.saveWorkspace({
      ...workspace,
      kindData: kindData === undefined || kindData === null ? null : JSON.stringify(kindData),
    });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await tauriCommands.deleteWorkspace(workspaceId);
  }

  async saveList(workspaceId: string, listName: WorkspaceListName, value: unknown): Promise<void> {
    await withUnknownWorkspaceError(workspaceId, () =>
      tauriCommands.saveWorkspaceList(workspaceId, listName, JSON.stringify(value)),
    );
  }

  async saveWindowSession(windowId: string, workspaceId: string, session: unknown): Promise<void> {
    await withUnknownWorkspaceError(workspaceId, () =>
      tauriCommands.saveWindowSession(windowId, workspaceId, JSON.stringify(session)),
    );
  }

  async loadAppValues(): Promise<Readonly<Record<string, unknown>>> {
    const values = await tauriCommands.loadAppValues();
    return Object.fromEntries(
      Object.entries(values).map(([key, json]) => [key, JSON.parse(json) as unknown]),
    );
  }

  async grantAccess(workspaceId: string, windowId: string): Promise<void> {
    await tauriCommands.grantWorkspaceAccess(workspaceId, windowId);
  }

  async saveAppValue(key: string, value: unknown): Promise<void> {
    await tauriCommands.saveAppValue(key, JSON.stringify(value));
  }
}

/** A damaged value reads as none, so one bad row never hides a workspace. */
function parsedOrNull(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function jsonTextOf(values: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
}

function contentsOf(reply: StoredWorkspaceReply): StoredWorkspaceContents {
  const lists = Object.fromEntries(
    WORKSPACE_LIST_NAMES.flatMap((listName) => {
      const json = reply.lists[listName];
      return json === undefined ? [] : [[listName, JSON.parse(json) as unknown]];
    }),
  );
  const windowSession = reply.windowSession === null ? null : (JSON.parse(reply.windowSession) as unknown);
  return { lists, windowSession };
}

async function withUnknownWorkspaceError(workspaceId: string, save: () => Promise<unknown>): Promise<void> {
  try {
    await save();
  } catch (error) {
    if (isUnknownWorkspaceReply(error)) throw new UnknownWorkspaceError(workspaceId);
    throw error;
  }
}

function isUnknownWorkspaceReply(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'unknownWorkspace';
}
