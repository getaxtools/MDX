import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { InMemoryDocumentFiles, ProtectedNotesError } from '@mdx/platform';
import { emit } from '@tauri-apps/api/event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TauriAppMenu } from './TauriAppMenu';
import { TauriAppState } from './TauriAppState';
import { TauriAttachments } from './TauriAttachments';
import { TauriDesktopShell } from './TauriDesktopShell';
import { TauriDocumentFiles } from './TauriDocumentFiles';
import { TauriDocumentRequests } from './TauriDocumentRequests';
import { TauriDocumentWatcher } from './TauriDocumentWatcher';
import { TauriFavouritesFile } from './TauriFavouritesFile';
import { TauriFolderWatcher } from './TauriFolderWatcher';
import { TauriFolders } from './TauriFolders';
import { TauriProtectedNotes } from './TauriProtectedNotes';

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

  it('reads a modified time through the read_modified_time command', async () => {
    const calls = mockCommands({ read_modified_time: () => 1_700_000_000_000 });

    await expect(new TauriDocumentFiles().readModifiedTime('C:\\a.md')).resolves.toBe(1_700_000_000_000);
    expect(calls).toEqual([{ command: 'read_modified_time', args: { path: 'C:\\a.md' } }]);
  });

  it('knows no modified time when the read is refused or the time is missing', async () => {
    mockCommands({
      read_modified_time: ({ path }) => {
        if (path === 'outside.md') throw new Error('accessDenied');
        return 0;
      },
    });

    await expect(new TauriDocumentFiles().readModifiedTime('outside.md')).resolves.toBeUndefined();
    await expect(new TauriDocumentFiles().readModifiedTime('a.md')).resolves.toBeUndefined();
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

  it('removes the kept backups through the remove_app_state_backups command', async () => {
    const calls = mockCommands({ remove_app_state_backups: () => null });

    await new TauriAppState().removeBackups();

    expect(calls.map((call) => call.command)).toEqual(['remove_app_state_backups']);
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

  it('opens the language settings with a request that names no page', async () => {
    const calls = mockCommands({ open_language_settings: () => null });

    await new TauriDesktopShell().openLanguageSettings();

    expect(calls).toEqual([{ command: 'open_language_settings', args: {} }]);
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
      editingMode: 'richText',
      isSidebarVisible: false,
      isOutlineVisible: true,
      isStatusBarVisible: true,
      isSourceView: false,
      isPreviewBesideEditor: false,
      isShowingHiddenCharacters: true,
    };

    await new TauriAppMenu().showViewState(state);

    expect(calls).toEqual([{ command: 'update_view_menu', args: { state } }]);
  });

  it('translates the native menu through the update_menu_language command', async () => {
    const calls = mockCommands({ update_menu_language: () => null });

    await new TauriAppMenu().showLabels({ 'menu.file': 'फ़ाइल' });

    expect(calls).toEqual([{ command: 'update_menu_language', args: { labels: { 'menu.file': 'फ़ाइल' } } }]);
  });

  it('lists recent documents and workspaces in the native menu through the update_recent_menu command', async () => {
    const calls = mockCommands({ update_recent_menu: () => null });

    await new TauriAppMenu().showRecentFiles(['C:\\Docs\\a.md'], [{ id: 'reading', name: 'Reading' }]);

    expect(calls).toEqual([
      {
        command: 'update_recent_menu',
        args: { displayPaths: ['C:\\Docs\\a.md'], workspaces: [{ id: 'reading', name: 'Reading' }] },
      },
    ]);
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

describe('TauriAttachments', () => {
  it('sends the notes folder with the pictures chosen in the dialog, as with a pasted picture', async () => {
    const calls = mockCommands({
      add_picture_files: () => [{ kind: 'saved', relativePath: '../Attachments/chart.png' }],
    });
    const target = {
      documentPath: 'E:/Notes/Projects/Plan.md',
      attachmentFolder: 'Attachments',
      notesFolder: 'E:/Notes',
    };

    const chosen = await new TauriAttachments().addPictureFiles(target, 'Pictures');

    expect(chosen).toEqual([{ kind: 'saved', relativePath: '../Attachments/chart.png' }]);
    expect(calls).toEqual([
      { command: 'add_picture_files', args: { request: { ...target, filterName: 'Pictures' } } },
    ]);
  });
});

describe('TauriProtectedNotes', () => {
  const LOCATION = 'C:\\Notes';
  const PASSWORD = 'correct horse battery';
  const NEW_PASSWORD = 'staple tuna lighthouse';
  const NOTE_ID = 'a'.repeat(32);

  function mockProtectedCommands() {
    return mockCommands({
      protected_status: () => ({
        isSetUp: true,
        isUnlocked: false,
        canUnlockOnThisPc: true,
        isReencrypting: false,
      }),
      protected_set_up: () => ({ recoveryKey: 'ABCD-EFGH' }),
      protected_unlock: () => ({ folderWarning: 'olderNotes' }),
      protected_unlock_with_recovery: () => ({}),
      protected_unlock_on_this_pc: () => ({}),
      protected_accept_folder: () => null,
      protected_forget_this_pc: () => null,
      protected_lock: () => null,
      protected_lock_all: () => null,
      protected_list: () => [],
      protected_create: () => NOTE_ID,
      protected_open: () => ({
        text: 'PIN',
        encoding: 'UTF-8',
        hasByteOrderMark: false,
        hasDecodingErrors: false,
        lineEnding: 'lf',
        revision: 2,
        isOlderCopy: false,
      }),
      protected_save: () => 3,
      protected_change_password: () => ({ recoveryKey: 'IJKL-MNOP' }),
      protected_continue_reencryption: () => ({
        remaining: 0,
        damaged: 0,
        heldBack: 0,
        isUnverifiable: false,
      }),
      protected_finish_reencryption: () => null,
      protected_new_recovery_key: () => ({ recoveryKey: 'QRST-UVWX' }),
    });
  }

  async function runEveryOperation(notes: TauriProtectedNotes) {
    await notes.status(LOCATION);
    await notes.setUp(LOCATION, PASSWORD);
    expect(await notes.unlock(LOCATION, PASSWORD, true)).toEqual({ folderWarning: 'olderNotes' });
    await notes.acceptFolder(LOCATION);
    await notes.unlockWithRecoveryKey(LOCATION, { recoveryKey: 'ABCD-EFGH', newPassword: PASSWORD });
    await notes.unlockOnThisPc(LOCATION);
    await notes.forgetThisPc(LOCATION);
    await notes.lock(LOCATION);
    await notes.lockAll();
    await notes.list(LOCATION);
    await notes.create(LOCATION, { title: 'Bank details', folder: '' });
    await notes.open(LOCATION, NOTE_ID);
    const revision = await notes.save(LOCATION, {
      noteId: NOTE_ID,
      text: 'PIN',
      encoding: 'UTF-8',
      hasByteOrderMark: false,
    });
    await notes.changePassword(LOCATION, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      shouldReencrypt: true,
    });
    await notes.continueReencryption(LOCATION);
    await notes.finishReencryption(LOCATION, NEW_PASSWORD, {
      discardCount: 2,
      acknowledgeUnverifiable: true,
    });
    await notes.newRecoveryKey(LOCATION, PASSWORD);
    return revision;
  }

  it('sends each operation to its command and the password only where the user typed it', async () => {
    const calls = mockProtectedCommands();

    expect(await runEveryOperation(new TauriProtectedNotes())).toBe(3);

    expect(calls.map((call) => call.command)).toEqual([
      'protected_status',
      'protected_set_up',
      'protected_unlock',
      'protected_accept_folder',
      'protected_unlock_with_recovery',
      'protected_unlock_on_this_pc',
      'protected_forget_this_pc',
      'protected_lock',
      'protected_lock_all',
      'protected_list',
      'protected_create',
      'protected_open',
      'protected_save',
      'protected_change_password',
      'protected_continue_reencryption',
      'protected_finish_reencryption',
      'protected_new_recovery_key',
    ]);
    const withPassword = calls
      .filter((call) => JSON.stringify(call.args).includes(PASSWORD))
      .map((call) => call.command);
    expect(withPassword).toEqual([
      'protected_set_up',
      'protected_unlock',
      'protected_unlock_with_recovery',
      'protected_change_password',
      'protected_new_recovery_key',
    ]);
    expect(calls[2]?.args).toEqual({ location: LOCATION, password: PASSWORD, remember: true });
    expect(calls.find((call) => call.command === 'protected_finish_reencryption')?.args).toEqual({
      location: LOCATION,
      password: NEW_PASSWORD,
      finish: { discardCount: 2, acknowledgeUnverifiable: true },
    });
    expect(calls.find((call) => call.command === 'protected_change_password')?.args).toEqual({
      location: LOCATION,
      change: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, reencrypt: true },
    });
  });

  it('receives no key material: what the commands answer holds only the fields of the port', async () => {
    mockProtectedCommands();
    const notes = new TauriProtectedNotes();

    const status = await notes.status(LOCATION);
    const opened = await notes.open(LOCATION, NOTE_ID);

    expect(Object.keys(status).sort()).toEqual([
      'canUnlockOnThisPc',
      'isReencrypting',
      'isSetUp',
      'isUnlocked',
    ]);
    expect(Object.keys(opened).sort()).toEqual([
      'encoding',
      'hasByteOrderMark',
      'hasDecodingErrors',
      'isOlderCopy',
      'lineEnding',
      'revision',
      'text',
    ]);
  });

  it('passes on the sections that locked in any window', async () => {
    mockWindows('main');
    mockIPC(() => null, { shouldMockEvents: true });
    const listener = vi.fn();
    const stop = new TauriProtectedNotes().onLocked(listener);

    await vi.waitFor(async () => {
      await emit('protected-notes-locked', { locationKeys: ['c:\\notes'] });
      expect(listener).toHaveBeenCalledWith(['c:\\notes']);
    });
    stop();
  });

  it('asks every window to save before a lock, and says whether all of them did', async () => {
    const calls = mockCommands({ protected_save_before_lock: () => ({ isEverythingSaved: false }) });

    const isEverythingSaved = await new TauriProtectedNotes().saveBeforeLock(LOCATION);

    expect(isEverythingSaved).toBe(false);
    expect(calls).toEqual([{ command: 'protected_save_before_lock', args: { location: LOCATION } }]);
  });

  it('answers a lock request with whether this window saved its edits', async () => {
    mockWindows('window-2');
    const answers: unknown[] = [];
    mockIPC(
      (command, args) => {
        if (command === 'protected_answer_lock_request') answers.push(args);
        return null;
      },
      { shouldMockEvents: true },
    );
    const stop = new TauriProtectedNotes().onLockRequested(() => Promise.resolve(true));

    await vi.waitFor(async () => {
      await emit('protected-notes-lock-requested', { requestId: 7, locationKeys: ['c:\\notes'] });
      expect(answers).toContainEqual({ answer: { requestId: 7, isEverythingSaved: true } });
    });
    stop();
  });

  it('turns a refusal into a code and nothing more', async () => {
    mockCommands({
      protected_unlock: () => {
        throw Object.assign(new Error('backend error'), { code: 'wrongPassword' });
      },
      protected_open: () => {
        throw new Error('something unexpected');
      },
    });
    const notes = new TauriProtectedNotes();

    await expect(notes.unlock(LOCATION, PASSWORD, false)).rejects.toEqual(
      new ProtectedNotesError('wrongPassword'),
    );
    await expect(notes.open(LOCATION, NOTE_ID)).rejects.toEqual(new ProtectedNotesError('unavailable'));
  });
});
