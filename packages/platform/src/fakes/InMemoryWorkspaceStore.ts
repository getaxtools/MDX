import {
  UnknownWorkspaceError,
  type LegacyStateImport,
  type StoredWorkspace,
  type StoredWorkspaceContents,
  type WorkspaceListName,
  type WorkspaceStorePort,
} from '../WorkspaceStorePort';

interface StoredWorkspaceRows {
  readonly workspace: StoredWorkspace;
  readonly lists: Map<WorkspaceListName, unknown>;
  readonly windowSessions: Map<string, unknown>;
}

/** Keeps the same rules as the desktop database: ordered registry, cascading delete, unknown ids refused. */
export class InMemoryWorkspaceStore implements WorkspaceStorePort {
  private readonly rows = new Map<string, StoredWorkspaceRows>();
  private readonly appValues = new Map<string, unknown>();
  saveCount = 0;
  readonly grantedWorkspaceIds: string[] = [];
  /** Set to make the next import fail, as a failed transaction in the desktop app would. */
  failsNextImport = false;

  async importLegacyState({
    workspace,
    lists,
    windowId,
    windowSession,
    appValues,
  }: LegacyStateImport): Promise<void> {
    if (this.failsNextImport) {
      this.failsNextImport = false;
      throw new Error('The import was rolled back');
    }
    if (this.rows.size > 0) throw new Error('Workspaces exist already');
    await this.saveWorkspace(workspace);
    for (const [listName, value] of Object.entries(lists))
      await this.saveList(workspace.id, listName as WorkspaceListName, value);
    await this.saveWindowSession(windowId, workspace.id, windowSession);
    for (const [key, value] of Object.entries(appValues)) await this.saveAppValue(key, value);
  }

  clearAll(): Promise<void> {
    this.rows.clear();
    this.appValues.clear();
    return Promise.resolve();
  }

  loadRegistry(): Promise<StoredWorkspace[]> {
    const workspaces = [...this.rows.values()].map((row) => row.workspace);
    return Promise.resolve(
      workspaces.sort((first, second) => first.position - second.position || compareIds(first.id, second.id)),
    );
  }

  loadWorkspace(workspaceId: string, windowId: string): Promise<StoredWorkspaceContents | undefined> {
    const row = this.rows.get(workspaceId);
    if (!row) return Promise.resolve(undefined);
    return Promise.resolve(
      structuredClone({
        lists: Object.fromEntries(row.lists),
        windowSession: row.windowSessions.get(windowId) ?? null,
      }),
    );
  }

  saveWorkspace(workspace: StoredWorkspace): Promise<void> {
    const existing = this.rows.get(workspace.id);
    this.rows.set(workspace.id, {
      workspace: { ...workspace },
      lists: existing?.lists ?? new Map<WorkspaceListName, unknown>(),
      windowSessions: existing?.windowSessions ?? new Map<string, unknown>(),
    });
    this.saveCount += 1;
    return Promise.resolve();
  }

  deleteWorkspace(workspaceId: string): Promise<void> {
    this.rows.delete(workspaceId);
    return Promise.resolve();
  }

  saveList(workspaceId: string, listName: WorkspaceListName, value: unknown): Promise<void> {
    const row = this.rows.get(workspaceId);
    if (!row) return Promise.reject(new UnknownWorkspaceError(workspaceId));
    row.lists.set(listName, structuredClone(value));
    this.saveCount += 1;
    return Promise.resolve();
  }

  /** What the desktop app does for a closed window, so a later window under its label starts empty. */
  deleteWindowSessions(windowId: string): void {
    for (const row of this.rows.values()) row.windowSessions.delete(windowId);
  }

  saveWindowSession(windowId: string, workspaceId: string, session: unknown): Promise<void> {
    const row = this.rows.get(workspaceId);
    if (!row) return Promise.reject(new UnknownWorkspaceError(workspaceId));
    row.windowSessions.set(windowId, structuredClone(session));
    this.saveCount += 1;
    return Promise.resolve();
  }

  loadAppValues(): Promise<Readonly<Record<string, unknown>>> {
    return Promise.resolve(structuredClone(Object.fromEntries(this.appValues)));
  }

  grantAccess(workspaceId: string): Promise<void> {
    this.grantedWorkspaceIds.push(workspaceId);
    return Promise.resolve();
  }

  saveAppValue(key: string, value: unknown): Promise<void> {
    this.appValues.set(key, structuredClone(value));
    this.saveCount += 1;
    return Promise.resolve();
  }
}

/** The same order as SQLite's text comparison, so both stores list ties alike. */
function compareIds(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
