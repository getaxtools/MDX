import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriAppMenu } from './TauriAppMenu';
import { TauriAppState } from './TauriAppState';
import { TauriDocumentFiles } from './TauriDocumentFiles';
import { TauriDocumentRequests } from './TauriDocumentRequests';
import { TauriDocumentWatcher } from './TauriDocumentWatcher';

type CommandArguments = Record<string, unknown>;

function mockCommands(handlers: Record<string, (args: CommandArguments) => unknown>) {
  const calls: { command: string; args: CommandArguments }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args: args as CommandArguments });
    const handler = handlers[command];
    if (!handler) throw new Error(`unexpected command ${command}`);
    return handler(args as CommandArguments);
  });
  return calls;
}

afterEach(() => clearMocks());

describe('TauriDocumentFiles', () => {
  it('opens a document through the open_document command', async () => {
    const document = { location: InMemoryDocumentFiles.locationOf('a.md'), text: '# A' };
    const calls = mockCommands({ open_document: () => document });

    const opened = await new TauriDocumentFiles().open('C:\\a.md');

    expect(opened).toEqual(document);
    expect(calls).toEqual([{ command: 'open_document', args: { path: 'C:\\a.md' } }]);
  });

  it('saves a document through the save_document_as command and reports a cancelled dialog', async () => {
    const savedPaths = ['C:\\Docs\\Table.md', null];
    const calls = mockCommands({ save_document_as: () => savedPaths.shift() });
    const source = { kind: 'text', text: '| a |', fileName: 'Untitled-1.md' } as const;

    expect(await new TauriDocumentFiles().saveAs(source)).toBe('C:\\Docs\\Table.md');
    expect(await new TauriDocumentFiles().saveAs(source)).toBeUndefined();
    expect(calls[0]).toEqual({ command: 'save_document_as', args: { source } });
  });

  it('turns a backend error code into a DocumentOpenError', async () => {
    mockCommands({
      open_document: () => {
        throw Object.assign(new Error('backend error'), { code: 'unreachable' });
      },
    });

    await expect(new TauriDocumentFiles().open('\\\\server\\a.md')).rejects.toMatchObject({
      failure: 'unreachable',
      path: '\\\\server\\a.md',
    });
  });

  it('treats an unknown backend error as unreadable', async () => {
    mockCommands({
      open_document: () => {
        throw new Error('boom');
      },
    });

    await expect(new TauriDocumentFiles().open('a.md')).rejects.toMatchObject({ failure: 'unreadable' });
  });

  it('maps path statuses back to canonical keys', async () => {
    mockCommands({ check_path_statuses: () => ['available', 'missing'] });
    const locations = ['A.md', 'B.md'].map((path) => InMemoryDocumentFiles.locationOf(path));

    const statuses = await new TauriDocumentFiles().checkPathStatuses(locations);

    expect([...statuses]).toEqual([
      ['a.md', 'available'],
      ['b.md', 'missing'],
    ]);
  });
});

describe('TauriAppState', () => {
  it('returns nothing on first launch', async () => {
    mockCommands({ load_app_state: () => null });

    expect(await new TauriAppState().load()).toBeUndefined();
  });

  it('parses the saved JSON', async () => {
    mockCommands({ load_app_state: () => '{"schemaVersion":1}' });

    expect(await new TauriAppState().load()).toEqual({ schemaVersion: 1 });
  });

  it('passes corrupt text through so the core can reset and tell the user', async () => {
    mockCommands({ load_app_state: () => '{ broken' });

    expect(await new TauriAppState().load()).toBe('{ broken');
  });

  it('saves the state as JSON text', async () => {
    const calls = mockCommands({ save_app_state: () => null });

    await new TauriAppState().save({ schemaVersion: 1 });

    expect(calls).toEqual([{ command: 'save_app_state', args: { stateJson: '{"schemaVersion":1}' } }]);
  });
});

describe('TauriDocumentRequests', () => {
  it('asks the backend for picked and startup documents', async () => {
    mockCommands({ pick_documents: () => ['picked.md'], take_startup_documents: () => ['startup.md'] });
    const requests = new TauriDocumentRequests();

    expect(await requests.pickDocuments()).toEqual(['picked.md']);
    expect(await requests.takeStartupDocuments()).toEqual(['startup.md']);
  });
});

describe('TauriAppMenu', () => {
  it('shows the view settings in the native menu through the update_view_menu command', async () => {
    const calls = mockCommands({ update_view_menu: () => null });
    const state = {
      theme: 'dark',
      readingWidth: 'wide',
      isSidebarVisible: false,
      isOutlineVisible: true,
      isStatusBarVisible: true,
      isSourceView: false,
    };

    await new TauriAppMenu().showViewState(state);

    expect(calls).toEqual([{ command: 'update_view_menu', args: { state } }]);
  });

  it('lists recent documents in the native menu through the update_recent_menu command', async () => {
    const calls = mockCommands({ update_recent_menu: () => null });

    await new TauriAppMenu().showRecentFiles(['C:\\Docs\\a.md']);

    expect(calls).toEqual([{ command: 'update_recent_menu', args: { displayPaths: ['C:\\Docs\\a.md'] } }]);
  });
});

describe('TauriDocumentWatcher', () => {
  it('watches the open documents through the watch_documents command', async () => {
    const calls = mockCommands({ watch_documents: () => null });

    await new TauriDocumentWatcher().watch(['C:\\Docs\\a.md']);

    expect(calls).toEqual([{ command: 'watch_documents', args: { paths: ['C:\\Docs\\a.md'] } }]);
  });
});
