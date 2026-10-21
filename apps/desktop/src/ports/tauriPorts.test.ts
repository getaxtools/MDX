import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TauriAppMenu } from './TauriAppMenu';
import { TauriAppState } from './TauriAppState';
import { TauriDesktopShell } from './TauriDesktopShell';
import { TauriDocumentFiles } from './TauriDocumentFiles';
import { TauriDocumentRequests } from './TauriDocumentRequests';
import { TauriDocumentWatcher } from './TauriDocumentWatcher';
import { TauriFavouritesFile } from './TauriFavouritesFile';
import { TauriFolderWatcher } from './TauriFolderWatcher';
import { TauriFolders } from './TauriFolders';

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
    expect(calls).toEqual([{ command: 'open_document', args: { path: 'C:\\a.md', encoding: null } }]);
  });

  it('saves edited text through the save_document command', async () => {
    const calls = mockCommands({ save_document: () => 42 });
    const document = {
      path: 'C:\\a.md',
      text: '# A',
      encoding: 'utf-8',
      hasByteOrderMark: true,
      expectedModifiedAtMs: 7,
      shouldOverwriteChangesOnDisk: false,
    };

    const modifiedAtMs = await new TauriDocumentFiles().save(document);

    expect(modifiedAtMs).toBe(42);
    expect(calls).toEqual([{ command: 'save_document', args: { document } }]);
  });

  it('turns a refused save into a typed error', async () => {
    mockCommands({
      save_document: () => {
        throw Object.assign(new Error('backend error'), { code: 'changedOnDisk' });
      },
    });

    const saving = new TauriDocumentFiles().save({
      path: 'C:\\a.md',
      text: '',
      encoding: 'utf-8',
      hasByteOrderMark: false,
      expectedModifiedAtMs: 0,
      shouldOverwriteChangesOnDisk: false,
    });

    await expect(saving).rejects.toMatchObject({ failure: 'changedOnDisk' });
  });

  it('reopens a document with a chosen encoding', async () => {
    const calls = mockCommands({ open_document: () => ({}) });

    await new TauriDocumentFiles().open('C:\\a.md', 'windows-1252');

    expect(calls).toEqual([
      { command: 'open_document', args: { path: 'C:\\a.md', encoding: 'windows-1252' } },
    ]);
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

describe('TauriDesktopShell', () => {
  it('reveals a path and toggles full screen through the backend', async () => {
    const calls = mockCommands({ reveal_in_file_manager: () => null, toggle_full_screen: () => null });
    const shell = new TauriDesktopShell();

    await shell.revealInFileManager('C:\\Docs\\guide.md');
    await shell.toggleFullScreen();

    expect(calls).toEqual([
      { command: 'reveal_in_file_manager', args: { path: 'C:\\Docs\\guide.md' } },
      { command: 'toggle_full_screen', args: {} },
    ]);
  });
});

describe('TauriDesktopShell clipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts HTML on the clipboard as rich text and as its markup', async () => {
    const written: Record<string, Blob>[] = [];
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(readonly items: Record<string, Blob>) {}
      },
    );
    vi.stubGlobal('navigator', {
      clipboard: {
        write: (items: { items: Record<string, Blob> }[]) => {
          written.push(...items.map((item) => item.items));
          return Promise.resolve();
        },
      },
    });

    await new TauriDesktopShell().writeClipboardHtml('<h1>Guide</h1>');

    const [item] = written;
    expect(Object.keys(item ?? {})).toEqual(['text/html', 'text/plain']);
    expect(await item?.['text/html']?.text()).toBe('<h1>Guide</h1>');
    expect(await item?.['text/plain']?.text()).toBe('<h1>Guide</h1>');
  });
});

describe('TauriFavouritesFile', () => {
  it('exports and imports favourites through the backend, reporting cancelled dialogs as undefined', async () => {
    const calls = mockCommands({
      export_favourites: () => null,
      import_favourites: () => '{"format":"mdx-favourites"}',
    });
    const favouritesFile = new TauriFavouritesFile();

    expect(await favouritesFile.exportFavourites('{}', 'MDX favourites.json')).toBeUndefined();
    expect(await favouritesFile.importFavourites()).toBe('{"format":"mdx-favourites"}');
    expect(calls[0]).toEqual({
      command: 'export_favourites',
      args: { contents: '{}', suggestedFileName: 'MDX favourites.json' },
    });
  });
});

describe('TauriAppMenu', () => {
  it('shows the view settings in the native menu through the update_view_menu command', async () => {
    const calls = mockCommands({ update_view_menu: () => null });
    const state = {
      theme: 'dark',
      readingWidth: 'wide',
      typography: 'book',
      isSidebarVisible: false,
      isOutlineVisible: true,
      isStatusBarVisible: true,
      isSourceView: false,
      isPreviewBesideEditor: false,
    };

    await new TauriAppMenu().showViewState(state);

    expect(calls).toEqual([{ command: 'update_view_menu', args: { state } }]);
  });

  it('translates the native menu through the update_menu_language command', async () => {
    const calls = mockCommands({ update_menu_language: () => null });

    await new TauriAppMenu().showLabels({ 'menu.file': 'फ़ाइल' });

    expect(calls).toEqual([{ command: 'update_menu_language', args: { labels: { 'menu.file': 'फ़ाइल' } } }]);
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

describe('TauriFolderWatcher', () => {
  it('watches the expanded folders through the watch_folders command', async () => {
    const calls = mockCommands({ watch_folders: () => null });

    await new TauriFolderWatcher().watch(['C:\\Docs']);

    expect(calls).toEqual([{ command: 'watch_folders', args: { paths: ['C:\\Docs'] } }]);
  });
});

describe('TauriFolders', () => {
  it('finds the documents below chosen folders through the find_folder_documents command', async () => {
    const plan = InMemoryDocumentFiles.locationOf('C:/Docs/plan.md');
    const calls = mockCommands({ find_folder_documents: () => [plan] });

    const documents = await new TauriFolders().findDocuments(['C:/Docs']);

    expect(documents).toEqual([plan]);
    expect(calls).toEqual([{ command: 'find_folder_documents', args: { folders: ['C:/Docs'] } }]);
  });

  it('searches the text of documents below chosen folders through the search_folder_documents command', async () => {
    const results = { documents: [], isIncomplete: false };
    const calls = mockCommands({ search_folder_documents: () => results });
    const options = { isCaseSensitive: true, isWholeWord: false };

    const found = await new TauriFolders().searchDocuments(['C:/Docs'], 'setup', options);

    expect(found).toEqual(results);
    expect(calls).toEqual([
      { command: 'search_folder_documents', args: { folders: ['C:/Docs'], query: 'setup', options } },
    ]);
  });
});
