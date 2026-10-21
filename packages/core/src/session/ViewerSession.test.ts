import { InMemoryAppState, InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ViewerSession, type ViewerState } from './ViewerSession';

const GUIDE_PATH = 'C:\\Docs\\Guide.md';
const NOTES_PATH = '\\\\server\\share\\Notes.md';

function createSession(appState = new InMemoryAppState()) {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE_PATH]: '# Guide', [NOTES_PATH]: '# Notes' });
  let clockMs = 1_000;
  const session = new ViewerSession({ documentFiles, appState, now: () => (clockMs += 1) });
  return { session, documentFiles, appState };
}

const tabNamesOf = (session: ViewerSession) =>
  session
    .currentState()
    .tabStrip.tabs()
    .map((tab) => tab.location.fileName);

describe('ViewerSession', () => {
  it('opens a document as the active tab and remembers it in recent files', async () => {
    const { session } = createSession();

    const document = await session.openDocument(GUIDE_PATH);

    expect(document.text).toBe('# Guide');
    expect(session.currentState().tabStrip.activeTab()?.location.fileName).toBe('Guide.md');
    expect(session.currentState().recentFiles.has(document.location.canonicalKey)).toBe(true);
  });

  it('focuses an open document without reading its file again', async () => {
    const { session, documentFiles } = createSession();
    await session.openDocument(GUIDE_PATH);
    documentFiles.write(GUIDE_PATH, '# Changed on disk');

    const document = await session.openDocument(GUIDE_PATH);

    expect(document.text).toBe('# Guide');
    expect(documentFiles.openedPaths).toEqual([GUIDE_PATH]);
  });

  it('focuses the existing tab when the same document is opened again', async () => {
    const { session } = createSession();

    await session.openDocument(GUIDE_PATH);
    await session.openDocument(NOTES_PATH);
    await session.openDocument(GUIDE_PATH.toUpperCase());

    expect(tabNamesOf(session)).toEqual(['Guide.md', 'Notes.md']);
    expect(session.currentState().tabStrip.activeTab()?.location.fileName).toBe('Guide.md');
  });

  it('leaves tabs and recent files unchanged when a document fails to open', async () => {
    const { session, documentFiles } = createSession();
    documentFiles.makeUnreachable(NOTES_PATH);

    await expect(session.openDocument(NOTES_PATH)).rejects.toMatchObject({ failure: 'unreachable' });

    expect(session.currentState().tabStrip.tabs()).toEqual([]);
    expect(session.currentState().recentFiles.entries()).toEqual([]);
  });

  it('restores tabs, favourites and recent files after a restart', async () => {
    const first = createSession();
    const guide = await first.session.openDocument(GUIDE_PATH);
    await first.session.openDocument(NOTES_PATH);
    first.session.updateFavourites((favourites) => favourites.add(guide.location, 'file'));
    first.session.updateTabs((tabStrip) => tabStrip.activate(guide.location.canonicalKey));
    await first.session.save();

    const second = createSession(first.appState);
    const { wasReset } = await second.session.restore();
    const activeDocument = await second.session.loadActiveDocument();

    expect(wasReset).toBe(false);
    expect(tabNamesOf(second.session)).toEqual(['Guide.md', 'Notes.md']);
    expect(second.session.currentState().favourites.isFavourite(guide.location.canonicalKey)).toBe(true);
    expect(second.session.currentState().recentFiles.entries()).toHaveLength(2);
    expect(activeDocument?.text).toBe('# Guide');
  });

  it('forgets everything when all data is cleared, and saves the empty state', async () => {
    const { session, appState } = createSession();
    const guide = await session.openDocument(GUIDE_PATH);
    session.updateFavourites((favourites) => favourites.add(guide.location, 'file'));
    session.updateViewSettings((viewSettings) => ({ ...viewSettings, theme: 'dark' }));

    session.clearAllData();
    await session.save();
    const restarted = createSession(appState);
    await restarted.session.restore();

    for (const state of [session.currentState(), restarted.session.currentState()]) {
      expect(state.tabStrip.tabs()).toEqual([]);
      expect(state.recentFiles.entries()).toEqual([]);
      expect(state.favourites.favourites()).toEqual([]);
      expect(state.viewSettings.theme).toBe('system');
    }
    expect(session.openedDocument(guide.location.canonicalKey)).toBeUndefined();
  });

  it('reports a reset when the saved state is corrupt', async () => {
    const { session } = createSession(new InMemoryAppState('corrupt'));

    const { wasReset } = await session.restore();

    expect(wasReset).toBe(true);
    expect(session.currentState().tabStrip.tabs()).toEqual([]);
  });

  it('loads nothing when no tab is open', async () => {
    const { session } = createSession();

    expect(await session.loadActiveDocument()).toBeUndefined();
  });

  it('reuses an already loaded document instead of reading it again', async () => {
    const { session, documentFiles } = createSession();
    await session.openDocument(GUIDE_PATH);

    await session.loadActiveDocument();

    expect(documentFiles.openedPaths).toEqual([GUIDE_PATH]);
  });

  it('forgets the content of closed tabs', async () => {
    const { session } = createSession();
    const guide = await session.openDocument(GUIDE_PATH);

    session.updateTabs((tabStrip) => tabStrip.close(guide.location.canonicalKey));

    expect(session.openedDocument(guide.location.canonicalKey)).toBeUndefined();
  });

  it('updates recent files', async () => {
    const { session } = createSession();
    await session.openDocument(GUIDE_PATH);

    session.updateRecentFiles((recentFiles) => recentFiles.clearAll());

    expect(session.currentState().recentFiles.entries()).toEqual([]);
  });

  it('updates and saves view settings', async () => {
    const { session, appState } = createSession();

    session.updateViewSettings((viewSettings) => ({ ...viewSettings, theme: 'dark' }));
    await session.save();
    const restarted = createSession(appState).session;
    await restarted.restore();

    expect(restarted.currentState().viewSettings.theme).toBe('dark');
  });

  it('reloads an open document that changed on disk without changing tabs or recent files', async () => {
    const { session, documentFiles } = createSession();
    await session.openDocument(GUIDE_PATH);
    await session.openDocument(NOTES_PATH);
    const recentBefore = session.currentState().recentFiles.entries();
    documentFiles.write(GUIDE_PATH, '# Guide, updated');

    await session.reloadDocuments([GUIDE_PATH]);

    const guide = session.currentState().tabStrip.tabs()[0]?.location;
    expect(session.openedDocument(guide?.canonicalKey ?? '')?.text).toBe('# Guide, updated');
    expect(session.currentState().tabStrip.activeTab()?.location.fileName).toBe('Notes.md');
    expect(session.currentState().recentFiles.entries()).toEqual(recentBefore);
  });

  it('forgets a changed document that can no longer be read, so it is opened again later', async () => {
    const { session, documentFiles } = createSession();
    const guide = await session.openDocument(GUIDE_PATH);
    documentFiles.delete(GUIDE_PATH);

    await session.reloadDocuments([GUIDE_PATH]);

    expect(session.openedDocument(guide.location.canonicalKey)).toBeUndefined();
  });

  it('reopens a document with a chosen encoding and keeps it when the file reloads', async () => {
    const { session, documentFiles } = createSession();
    await session.openDocument(GUIDE_PATH);

    await session.reopenWithEncoding(GUIDE_PATH.toLowerCase(), 'windows-1252');
    await session.reloadDocuments([GUIDE_PATH]);
    await session.reopenWithEncoding(GUIDE_PATH.toLowerCase(), undefined);
    await session.reloadDocuments([GUIDE_PATH]);

    expect(documentFiles.openedEncodings).toEqual([
      undefined,
      'windows-1252',
      'windows-1252',
      undefined,
      undefined,
    ]);
  });

  describe('saving edited text', () => {
    it('writes the text back with the document line breaks and keeps the new file time', async () => {
      const { session, documentFiles } = createSession();
      documentFiles.write(GUIDE_PATH, '# Guide\r\nOld\r\n');
      const opened = await session.openDocument(GUIDE_PATH);

      await session.saveEditedDocument(opened.location.canonicalKey, '# Guide\nNew\n');

      expect(documentFiles.textOf(GUIDE_PATH)).toBe('# Guide\r\nNew\r\n');
      expect(documentFiles.savedDocuments[0]).toMatchObject({
        encoding: 'utf-8',
        hasByteOrderMark: false,
        expectedModifiedAtMs: opened.modifiedAtMs,
      });
      expect(session.openedDocument(opened.location.canonicalKey)?.text).toBe('# Guide\r\nNew\r\n');
    });

    it('refuses to overwrite a file another program changed, unless asked to', async () => {
      const { session, documentFiles } = createSession();
      const opened = await session.openDocument(GUIDE_PATH);
      documentFiles.write(GUIDE_PATH, '# Changed elsewhere');

      const refused = session.saveEditedDocument(opened.location.canonicalKey, '# Mine');
      await expect(refused).rejects.toMatchObject({ failure: 'changedOnDisk' });
      await session.saveEditedDocument(opened.location.canonicalKey, '# Mine', {
        shouldOverwriteChangesOnDisk: true,
      });

      expect(documentFiles.textOf(GUIDE_PATH)).toBe('# Mine');
    });

    it('refuses to save a document it does not hold, so the edits are not dropped', async () => {
      const { session } = createSession();

      await expect(session.saveEditedDocument('c:\\docs\\gone.md', '# Mine')).rejects.toMatchObject({
        failure: 'unreadable',
      });
    });

    it('refuses to save over a file whose bytes did not fit its encoding', async () => {
      const { session, documentFiles } = createSession();
      const opened = await session.openDocument(GUIDE_PATH);
      const lossy = { ...opened, hasDecodingErrors: true };
      documentFiles.open = () => Promise.resolve(lossy);
      await session.reloadDocuments([GUIDE_PATH]);

      await expect(session.saveEditedDocument(opened.location.canonicalKey, '# Mine')).rejects.toMatchObject({
        failure: 'lossyDecoding',
      });
      expect(documentFiles.savedDocuments).toEqual([]);
    });

    it('keeps reading a saved document in the encoding it was saved in', async () => {
      const { session, documentFiles } = createSession();
      const opened = await session.openDocument(GUIDE_PATH);

      await session.saveEditedDocument(opened.location.canonicalKey, '# Saved');
      await session.reloadDocuments([GUIDE_PATH]);

      expect(documentFiles.openedEncodings.at(-1)).toBe('utf-8');
    });

    it('saves edited text of a document with a file as text when using Save As', async () => {
      const { session, documentFiles } = createSession();
      const opened = await session.openDocument(GUIDE_PATH);
      documentFiles.saveAsChoices.push('C:\\Docs\\Copy.md');

      await session.saveDocumentAs(opened.location.canonicalKey, '# Edited');

      expect(documentFiles.savedSources).toEqual([{ kind: 'text', text: '# Edited', fileName: 'Guide.md' }]);
      expect(documentFiles.textOf('C:\\Docs\\Copy.md')).toBe('# Edited');
    });
  });

  describe('documents that are not saved yet', () => {
    const nameFor = (number: number) => `Untitled-${String(number)}.md`;

    it('opens text as a new numbered document without adding it to recent files', async () => {
      const { session } = createSession();

      session.openUntitledDocument('| a |', nameFor);
      session.openUntitledDocument('| b |', nameFor);

      expect(tabNamesOf(session)).toEqual(['Untitled-1.md', 'Untitled-2.md']);
      expect(session.currentState().recentFiles.entries()).toEqual([]);
      expect((await session.loadActiveDocument())?.text).toBe('| b |');
    });

    it('saves a new document where the user chooses and shows the saved file in its tab', async () => {
      const { session, documentFiles } = createSession();
      session.openUntitledDocument('| a |', nameFor);
      documentFiles.saveAsChoices.push('C:\\Docs\\Table.md');

      const saved = await session.saveDocumentAs('untitled:1');

      expect(saved?.fileName).toBe('Table.md');
      expect(documentFiles.savedSources).toEqual([
        { kind: 'text', text: '| a |', fileName: 'Untitled-1.md' },
      ]);
      expect(tabNamesOf(session)).toEqual(['Table.md']);
      expect(session.currentState().recentFiles.has(saved?.canonicalKey ?? '')).toBe(true);
      expect((await session.loadActiveDocument())?.text).toBe('| a |');
    });

    it('keeps the new document when the user cancels Save As', async () => {
      const { session } = createSession();
      session.openUntitledDocument('| a |', nameFor);

      const saved = await session.saveDocumentAs('untitled:1');

      expect(saved).toBeUndefined();
      expect(tabNamesOf(session)).toEqual(['Untitled-1.md']);
    });

    it('saves a copy of an opened document and shows the copy in its tab', async () => {
      const { session, documentFiles } = createSession();
      await session.openDocument(GUIDE_PATH);
      documentFiles.saveAsChoices.push('C:\\Docs\\Guide copy.md');

      await session.saveDocumentAs(GUIDE_PATH.toLowerCase());

      expect(documentFiles.savedSources).toEqual([{ kind: 'copy', path: GUIDE_PATH }]);
      expect(tabNamesOf(session)).toEqual(['Guide copy.md']);
      expect((await session.loadActiveDocument())?.text).toBe('# Guide');
    });
  });

  it('notifies subscribers of every change until they unsubscribe', async () => {
    const { session } = createSession();
    const notifications: ViewerState[] = [];
    const unsubscribe = session.subscribe((state) => notifications.push(state));

    await session.openDocument(GUIDE_PATH);
    unsubscribe();
    await session.openDocument(NOTES_PATH);

    expect(notifications).toHaveLength(1);
  });
});
