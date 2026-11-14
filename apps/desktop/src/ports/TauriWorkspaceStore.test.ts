import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import {
  InMemoryWorkspaceStore,
  UnknownWorkspaceError,
  type StoredWorkspace,
  type WorkspaceStorePort,
} from '@mdx/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriWorkspaceStore } from './TauriWorkspaceStore';

type CommandArguments = Record<string, unknown>;

const DEFAULT_WORKSPACE: StoredWorkspace = {
  id: 'default',
  kindId: 'markdownViewer',
  name: 'Default',
  icon: null,
  colour: '#3366cc',
  position: 0,
  lastShownAtMs: 5,
};

/** Stands in for the Rust commands: rows hold JSON text, as the database columns do. */
function mockDatabaseCommands() {
  const workspaces = new Map<string, StoredWorkspace>();
  const lists = new Map<string, string>();
  const sessions = new Map<string, string>();
  const appValues = new Map<string, string>();
  const handlers: Record<string, (args: CommandArguments) => unknown> = {
    load_workspace_registry: () => [...workspaces.values()],
    save_workspace: ({ workspace }) =>
      void workspaces.set((workspace as StoredWorkspace).id, workspace as StoredWorkspace),
    save_workspace_list: ({ workspaceId, listName, valueJson }) =>
      void lists.set(`${String(workspaceId)}/${String(listName)}`, String(valueJson)),
    save_window_session: ({ windowId, workspaceId, sessionJson }) =>
      void sessions.set(`${String(windowId)}/${String(workspaceId)}`, String(sessionJson)),
    load_workspace: ({ workspaceId, windowId }) => ({
      lists: Object.fromEntries(
        [...lists]
          .filter(([key]) => key.startsWith(`${String(workspaceId)}/`))
          .map(([key, json]) => [key.slice(String(workspaceId).length + 1), json]),
      ),
      windowSession: sessions.get(`${String(windowId)}/${String(workspaceId)}`) ?? null,
    }),
    load_app_values: () => Object.fromEntries(appValues),
    save_app_value: ({ key, valueJson }) => void appValues.set(String(key), String(valueJson)),
  };
  mockIPC((command, args) => {
    const handler = handlers[command];
    if (!handler) throw new Error(`unexpected command ${command}`);
    return handler(args as CommandArguments) ?? null;
  });
}

async function saveAndLoad(store: WorkspaceStorePort) {
  await store.saveWorkspace(DEFAULT_WORKSPACE);
  await store.saveList('default', 'favourites', [{ location: { fileName: 'a.md' }, kind: 'file' }]);
  await store.saveList('default', 'recentFiles', []);
  await store.saveWindowSession('main', 'default', { tabs: { tabs: [] }, layout: { isSidebarShown: true } });
  await store.saveAppValue('controlWheel', { dock: 'bottomLeft' });
  return {
    registry: await store.loadRegistry(),
    contents: await store.loadWorkspace('default', 'main'),
    appValues: await store.loadAppValues(),
  };
}

/** A failed command as the webview receives it: an error carrying the command's error code. */
function commandError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

afterEach(() => clearMocks());

describe('TauriWorkspaceStore', () => {
  it('the fake and the desktop port agree on load and save', async () => {
    mockDatabaseCommands();

    const fromDesktop = await saveAndLoad(new TauriWorkspaceStore());
    const fromFake = await saveAndLoad(new InMemoryWorkspaceStore());

    expect(fromDesktop).toEqual(fromFake);
  });

  it('sends the import with every part as JSON text', async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      return null;
    });

    await new TauriWorkspaceStore().importLegacyState({
      workspace: DEFAULT_WORKSPACE,
      lists: {
        recentFiles: [],
        favourites: [1],
        favouriteGroups: [],
        explorerFolders: [],
        settingsOverrides: {},
      },
      windowId: 'main',
      windowSession: { tabs: { tabs: [] } },
      appValues: { viewSettings: { zoomPercent: 125 } },
    });

    expect(calls).toEqual([
      {
        command: 'import_legacy_state',
        args: {
          legacyState: {
            workspace: DEFAULT_WORKSPACE,
            lists: {
              recentFiles: '[]',
              favourites: '[1]',
              favouriteGroups: '[]',
              explorerFolders: '[]',
              settingsOverrides: '{}',
            },
            windowId: 'main',
            windowSession: '{"tabs":{"tabs":[]}}',
            appValues: { viewSettings: '{"zoomPercent":125}' },
          },
        },
      },
    ]);
  });

  it('turns a missing workspace into undefined', async () => {
    mockIPC(() => null);

    expect(await new TauriWorkspaceStore().loadWorkspace('missing', 'main')).toBeUndefined();
  });

  it('reports a list saved for an unknown workspace as an UnknownWorkspaceError', async () => {
    mockIPC(() => {
      throw commandError('unknownWorkspace');
    });

    await expect(new TauriWorkspaceStore().saveList('missing', 'favourites', [])).rejects.toBeInstanceOf(
      UnknownWorkspaceError,
    );
  });

  it('passes other failures through unchanged', async () => {
    mockIPC(() => {
      throw commandError('storageUnavailable');
    });

    await expect(new TauriWorkspaceStore().saveWindowSession('main', 'default', {})).rejects.toMatchObject({
      code: 'storageUnavailable',
    });
  });
});
