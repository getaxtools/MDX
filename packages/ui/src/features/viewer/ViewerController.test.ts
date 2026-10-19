import { FavouritesList, parseFavouritesFile, toFavouritesFile, ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppMenu,
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
  InMemoryDocumentWatcher,
  InMemoryFavouritesFile,
  InMemoryFolders,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATE_SAVE_DELAY_MS, ViewerController, type ViewerSnapshot } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';

function createViewer({
  startupPaths = [] as string[],
  appState = new InMemoryAppState(),
  menu = new InMemoryAppMenu(),
  watcher = new InMemoryDocumentWatcher(),
  links = new InMemoryDocumentLinks(),
  folders = new InMemoryFolders({ 'C:\\Docs': { folders: ['C:\\Docs\\Specs'], documents: [GUIDE, NOTES] } }),
  favouritesFile = new InMemoryFavouritesFile(),
} = {}) {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [NOTES]: '# Notes' });
  const requests = new InMemoryDocumentRequests(startupPaths);
  const session = new ViewerSession({ documentFiles, appState, now: () => Date.now() });
  const controller = new ViewerController({
    session,
    requests,
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    menu,
    watcher,
    links,
    folders,
    favouritesFile,
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return {
    controller,
    session,
    requests,
    documentFiles,
    appState,
    menu,
    watcher,
    links,
    folders,
    favouritesFile,
    snapshot,
  };
}

const tabNames = (snapshot: ViewerSnapshot) =>
  snapshot.viewer.tabStrip.tabs().map((tab) => tab.location.fileName);

describe('ViewerController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens startup documents and renders the active one', async () => {
    const { controller, snapshot } = createViewer({ startupPaths: [GUIDE, NOTES] });

    await controller.start();

    expect(tabNames(snapshot())).toEqual(['Guide.md', 'Notes.md']);
    expect(snapshot().activeDocument?.fileName).toBe('Notes.md');
    expect(snapshot().activeDocument?.html).toContain('<h1 id="mdx-notes">Notes</h1>');
    expect(snapshot().activeDocument?.outline).toEqual([{ level: 1, text: 'Notes', id: 'mdx-notes' }]);
  });

  it('opens documents requested from outside, such as a drop or a second launch', async () => {
    const { controller, requests, snapshot } = createViewer();
    await controller.start();

    requests.requestDocuments([GUIDE]);
    await vi.waitFor(() => expect(tabNames(snapshot())).toEqual(['Guide.md']));
  });

  it('opens the documents picked in the open dialog', async () => {
    const { controller, requests, snapshot } = createViewer();
    requests.pickedPaths = [GUIDE];
    await controller.start();

    await controller.execute({ kind: 'openDocuments' });

    expect(tabNames(snapshot())).toEqual(['Guide.md']);
  });

  it('explains why a document could not be opened', async () => {
    const { controller, documentFiles, snapshot } = createViewer({ startupPaths: [NOTES] });
    documentFiles.makeUnreachable(NOTES);

    await controller.start();

    expect(snapshot().notice).toBe(
      `The location of ${NOTES} can't be reached. Check your network connection and try again.`,
    );
    expect(tabNames(snapshot())).toEqual([]);
  });

  it('dismisses the notice', async () => {
    const { controller, documentFiles, snapshot } = createViewer({ startupPaths: [NOTES] });
    documentFiles.delete(NOTES);
    await controller.start();

    controller.dismissNotice();

    expect(snapshot()).not.toHaveProperty('notice');
  });

  it('tells the user when saved state had to be reset', async () => {
    const { controller, snapshot } = createViewer({ appState: new InMemoryAppState('corrupt') });

    await controller.start();

    expect(snapshot().notice).toBe('Your saved tabs and favourites could not be read, so MDX started fresh.');
  });

  it('saves state shortly after a change, not on every change', async () => {
    const { controller, appState } = createViewer();
    await controller.start();

    await controller.openDocuments([GUIDE, NOTES]);
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS - 1);
    const savesBeforeDelay = appState.saveCount;
    await vi.advanceTimersByTimeAsync(1);

    expect(savesBeforeDelay).toBe(0);
    expect(appState.saveCount).toBe(1);
  });

  it('restores tabs and loads the active document after a restart', async () => {
    const first = createViewer({ startupPaths: [GUIDE] });
    await first.controller.start();
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);
    first.controller.stop();

    const second = createViewer({ appState: first.appState });
    await second.controller.start();

    expect(tabNames(second.snapshot())).toEqual(['Guide.md']);
    expect(second.snapshot().activeDocument?.html).toContain('Guide');
  });

  it('shows restored favourites and recent files when no tab was left open', async () => {
    const first = createViewer({ startupPaths: [GUIDE] });
    await first.controller.start();
    await first.controller.execute({ kind: 'toggleFavourite' });
    await first.controller.execute({ kind: 'closeActiveTab' });
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);
    first.controller.stop();

    const second = createViewer({ appState: first.appState });
    await second.controller.start();

    const restored = second.snapshot().viewer;
    expect(restored.favourites.favourites().map((favourite) => favourite.location.fileName)).toEqual([
      'Guide.md',
    ]);
    expect(restored.recentFiles.entries().map((recentFile) => recentFile.location.fileName)).toEqual([
      'Guide.md',
    ]);
    expect(tabNames(second.snapshot())).toEqual([]);
  });

  it('does not save again just because the saved state was restored', async () => {
    const first = createViewer({ startupPaths: [GUIDE] });
    await first.controller.start();
    await first.controller.execute({ kind: 'closeActiveTab' });
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);
    first.controller.stop();
    const savesBeforeRestart = first.appState.saveCount;

    const second = createViewer({ appState: first.appState });
    await second.controller.start();
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);

    expect(first.appState.saveCount).toBe(savesBeforeRestart);
  });

  it('reports a restored tab whose file has disappeared', async () => {
    const first = createViewer({ startupPaths: [GUIDE] });
    await first.controller.start();
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);

    const second = createViewer({ appState: first.appState });
    second.documentFiles.delete(GUIDE);
    await second.controller.start();

    expect(second.snapshot().notice).toContain('could not be found');
    expect(second.snapshot()).not.toHaveProperty('activeDocument');
  });

  describe('commands', () => {
    async function viewerWithTwoTabs() {
      const viewer = createViewer({ startupPaths: [GUIDE, NOTES] });
      await viewer.controller.start();
      return viewer;
    }

    it('closes the active tab', async () => {
      const { controller, snapshot } = await viewerWithTwoTabs();

      await controller.execute({ kind: 'closeActiveTab' });
      await vi.waitFor(() => expect(snapshot().activeDocument?.fileName).toBe('Guide.md'));

      expect(tabNames(snapshot())).toEqual(['Guide.md']);
    });

    it('reopens the last closed tab', async () => {
      const { controller, snapshot } = await viewerWithTwoTabs();

      await controller.execute({ kind: 'closeActiveTab' });
      await controller.execute({ kind: 'reopenClosedTab' });

      expect(tabNames(snapshot())).toEqual(['Guide.md', 'Notes.md']);
    });

    it('switches tabs forward, backward and by number', async () => {
      const { controller, snapshot } = await viewerWithTwoTabs();
      const activeName = () => snapshot().viewer.tabStrip.activeTab()?.location.fileName;

      await controller.execute({ kind: 'nextTab' });
      expect(activeName()).toBe('Guide.md');
      await controller.execute({ kind: 'previousTab' });
      expect(activeName()).toBe('Notes.md');
      await controller.execute({ kind: 'activateTabNumber', numberKey: 1 });
      expect(activeName()).toBe('Guide.md');
    });

    it('toggles the active document as a favourite', async () => {
      const { controller, snapshot } = await viewerWithTwoTabs();
      const isNotesFavourite = () =>
        snapshot()
          .viewer.favourites.favourites()
          .some((favourite) => favourite.location.fileName === 'Notes.md');

      await controller.execute({ kind: 'toggleFavourite' });
      expect(isNotesFavourite()).toBe(true);
      await controller.execute({ kind: 'toggleFavourite' });
      expect(isNotesFavourite()).toBe(false);
    });

    it('does nothing for tab commands when no document is open', async () => {
      const { controller, snapshot } = createViewer();
      await controller.start();

      await controller.execute({ kind: 'closeActiveTab' });
      await controller.execute({ kind: 'toggleFavourite' });

      expect(tabNames(snapshot())).toEqual([]);
      expect(snapshot().viewer.favourites.favourites()).toEqual([]);
    });
  });

  describe('sidebar and tab actions', () => {
    it('opens file favourites and recent files, and ignores folder favourites for now', async () => {
      const { controller, session, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      const guide = snapshot().viewer.tabStrip.tabs()[0];
      if (!guide) throw new Error('expected an open tab');
      controller.closeTab(guide.location.canonicalKey);

      await controller.openFavourite({ location: guide.location, kind: 'folder' });
      expect(tabNames(snapshot())).toEqual([]);
      await controller.openFavourite({ location: guide.location, kind: 'file' });
      expect(tabNames(snapshot())).toEqual(['Guide.md']);

      session.updateTabs((tabStrip) => tabStrip.close(guide.location.canonicalKey));
      const [recentFile] = snapshot().viewer.recentFiles.entries();
      if (!recentFile) throw new Error('expected a recent file');
      await controller.openRecentFile(recentFile);
      expect(tabNames(snapshot())).toEqual(['Guide.md']);
    });

    it('activates a tab chosen in the tab strip', async () => {
      const { controller, snapshot } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();
      const [guide] = snapshot().viewer.tabStrip.tabs();
      if (!guide) throw new Error('expected an open tab');

      controller.activateTab(guide.location.canonicalKey);

      await vi.waitFor(() => expect(snapshot().activeDocument?.fileName).toBe('Guide.md'));
    });
  });

  it('saves immediately when asked, for example when the window closes', async () => {
    const { controller, appState } = createViewer({ startupPaths: [GUIDE] });
    await controller.start();

    await controller.saveNow();
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);

    expect(appState.saveCount).toBe(1);
  });

  it('stops listening for requests and pending saves when stopped', async () => {
    const { controller, requests, appState } = createViewer({ startupPaths: [GUIDE] });
    await controller.start();

    controller.stop();
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);

    expect(requests.listenerCount()).toBe(0);
    expect(appState.saveCount).toBe(0);
  });

  it('shows images next to the document through the resources port', async () => {
    const documentFiles = new InMemoryDocumentFiles({ [GUIDE]: '![Diagram](images/diagram.png)' });
    const controller = new ViewerController({
      session: new ViewerSession({ documentFiles, appState: new InMemoryAppState(), now: () => 0 }),
      requests: new InMemoryDocumentRequests([GUIDE]),
      renderer: createMarkdownRenderer({ window }),
      translator: createTranslator(),
      resources: {
        imageUrl: (documentPath, source) => `image://${encodeURIComponent(documentPath)}/${source}`,
      },
    });
    let html = '';
    controller.subscribe((snapshot) => (html = snapshot.activeDocument?.html ?? ''));

    await controller.start();

    expect(html).toContain(`src="image://${encodeURIComponent(GUIDE)}/images/diagram.png"`);
  });

  it('prints only when a document is open', async () => {
    const printer = { printActiveDocument: vi.fn() };
    const empty = new ViewerController({
      session: new ViewerSession({
        documentFiles: new InMemoryDocumentFiles(),
        appState: new InMemoryAppState(),
        now: () => 0,
      }),
      requests: new InMemoryDocumentRequests(),
      renderer: createMarkdownRenderer({ window }),
      translator: createTranslator(),
      printer,
    });
    await empty.start();
    await empty.execute({ kind: 'print' });
    expect(printer.printActiveDocument).not.toHaveBeenCalled();

    const withDocument = new ViewerController({
      session: new ViewerSession({
        documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide' }),
        appState: new InMemoryAppState(),
        now: () => 0,
      }),
      requests: new InMemoryDocumentRequests([GUIDE]),
      renderer: createMarkdownRenderer({ window }),
      translator: createTranslator(),
      printer,
    });
    await withDocument.start();
    await withDocument.execute({ kind: 'print' });

    expect(printer.printActiveDocument).toHaveBeenCalledOnce();
  });

  it('remembers where each tab was scrolled and restores it after a restart', async () => {
    const first = createViewer({ startupPaths: [GUIDE] });
    await first.controller.start();
    first.controller.rememberScrollPosition(0.4);
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);
    first.controller.stop();

    const second = createViewer({ appState: first.appState });
    await second.controller.start();

    expect(second.snapshot().activeDocument?.scrollRatio).toBe(0.4);
  });

  it('passes front matter on so it can be shown as properties', async () => {
    const documentFiles = new InMemoryDocumentFiles({ [GUIDE]: '---\ntitle: Guide\n---\n# Guide' });
    const controller = new ViewerController({
      session: new ViewerSession({ documentFiles, appState: new InMemoryAppState(), now: () => 0 }),
      requests: new InMemoryDocumentRequests([GUIDE]),
      renderer: createMarkdownRenderer({ window }),
      translator: createTranslator(),
    });
    let frontMatter: string | undefined;
    controller.subscribe((snapshot) => (frontMatter = snapshot.activeDocument?.frontMatter));

    await controller.start();

    expect(frontMatter).toBe('title: Guide');
  });

  it('switches between the rendered document and its source', async () => {
    const { controller, snapshot } = createViewer({ startupPaths: [GUIDE] });
    await controller.start();

    await controller.execute({ kind: 'toggleSourceView' });
    expect(snapshot().isSourceView).toBe(true);
    expect(snapshot().activeDocument?.source).toBe('# Guide');
    await controller.execute({ kind: 'toggleSourceView' });

    expect(snapshot()).not.toHaveProperty('isSourceView');
  });

  describe('folder favourites', () => {
    it('adds a chosen folder to the favourites once', async () => {
      const { controller, folders, snapshot } = createViewer();
      folders.pickedFolder = 'C:\\Docs';
      await controller.start();

      await controller.execute({ kind: 'openFolder' });
      await controller.execute({ kind: 'openFolder' });

      const favourites = snapshot().viewer.favourites.favourites();
      expect(favourites.map((favourite) => [favourite.location.fileName, favourite.kind])).toEqual([
        ['Docs', 'folder'],
      ]);
    });

    it('does nothing when the user cancels choosing a folder', async () => {
      const { controller, snapshot } = createViewer();
      await controller.start();

      await controller.execute({ kind: 'openFolder' });

      expect(snapshot().viewer.favourites.favourites()).toEqual([]);
    });

    it('lists the subfolders and documents in a favourite folder', async () => {
      const { controller } = createViewer();
      await controller.start();

      const listing = await controller.listFolderContents('C:\\Docs');

      expect(listing.folders.map((folder) => folder.fileName)).toEqual(['Specs']);
      expect(listing.documents.map((document) => document.fileName)).toEqual(['Guide.md', 'Notes.md']);
    });

    it('lists nothing when a folder cannot be read', async () => {
      const folders = new InMemoryFolders();
      folders.listFolderContents = () => Promise.reject(new Error('unreachable'));
      const { controller } = createViewer({ folders });
      await controller.start();

      const listing = await controller.listFolderContents('C:\\Offline');

      expect(listing).toEqual({ folders: [], documents: [] });
    });
  });

  describe('links', () => {
    it('opens a linked document in a new tab', async () => {
      const { controller, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.openLink({ kind: 'document', href: 'Notes.md' });

      expect(tabNames(snapshot())).toEqual(['Guide.md', 'Notes.md']);
      expect(snapshot().activeDocument?.fileName).toBe('Notes.md');
    });

    it('explains when a linked document cannot be opened', async () => {
      const { controller, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.openLink({ kind: 'document', href: 'Missing.md' });

      expect(snapshot().notice).toContain('could not be found');
    });

    it('asks before opening a web link and opens it only when confirmed', async () => {
      const { controller, links, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.openLink({ kind: 'external', href: 'https://example.com' });
      expect(snapshot().externalLinkRequest).toBe('https://example.com');
      expect(links.openedExternalLinks).toEqual([]);
      controller.answerExternalLink(true);

      expect(links.openedExternalLinks).toEqual(['https://example.com']);
      expect(snapshot()).not.toHaveProperty('externalLinkRequest');
    });

    it('does not open a web link the user declined', async () => {
      const { controller, links } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.openLink({ kind: 'external', href: 'https://example.com' });
      controller.answerExternalLink(false);

      expect(links.openedExternalLinks).toEqual([]);
    });
  });

  describe('live reload', () => {
    it('watches exactly the open documents', async () => {
      const { controller, watcher } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();

      await controller.execute({ kind: 'closeActiveTab' });

      expect(watcher.watchedPaths).toEqual([GUIDE]);
    });

    it('shows the new text when the active document changes on disk', async () => {
      const { controller, documentFiles, watcher, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      documentFiles.write(GUIDE, '# Guide, second edition');

      watcher.reportChanges([GUIDE]);

      await vi.waitFor(() => expect(snapshot().activeDocument?.html).toContain('second edition'));
    });

    it('marks a tab as missing when its file is deleted by another program', async () => {
      const { controller, documentFiles, watcher, snapshot } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();
      const guideKey = snapshot().viewer.tabStrip.tabs()[0]?.location.canonicalKey ?? '';
      documentFiles.delete(GUIDE);

      watcher.reportChanges([GUIDE]);

      await vi.waitFor(() => expect(snapshot().pathStatuses.get(guideKey)).toBe('missing'));
    });

    it('explains when the active document was deleted by another program', async () => {
      const { controller, documentFiles, watcher, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      documentFiles.delete(GUIDE);

      watcher.reportChanges([GUIDE]);

      await vi.waitFor(() => expect(snapshot().notice).toContain('could not be found'));
    });
  });

  describe('new documents and saving', () => {
    const TABLE = 'C:\\Docs\\Table.md';

    async function viewerWithNewDocument(startupPaths: string[] = []) {
      const viewer = createViewer({ startupPaths });
      await viewer.controller.start();
      await viewer.controller.execute({ kind: 'showPasteTable' });
      viewer.controller.openAsNewDocument('| a |\n| - |');
      await vi.waitFor(() => expect(viewer.snapshot().activeDocument?.isUntitled).toBe(true));
      return viewer;
    }

    it('opens a converted table as a new document and closes the converter', async () => {
      const { snapshot } = await viewerWithNewDocument();

      expect(tabNames(snapshot())).toEqual(['Untitled-1.md']);
      expect(snapshot().activeDocument?.html).toContain('<table>');
      expect(snapshot()).not.toHaveProperty('openDialog');
    });

    it('saves a new document with Save and shows the saved file in its tab', async () => {
      const { controller, documentFiles, snapshot } = await viewerWithNewDocument();
      documentFiles.saveAsChoices.push(TABLE);

      await controller.execute({ kind: 'saveDocument' });

      await vi.waitFor(() => expect(tabNames(snapshot())).toEqual(['Table.md']));
      expect(snapshot().activeDocument?.isUntitled).toBe(false);
    });

    it('does nothing on Save for a document that already has a file', async () => {
      const { controller, documentFiles } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.execute({ kind: 'saveDocument' });

      expect(documentFiles.savedSources).toEqual([]);
    });

    it('saves a copy of an opened document with Save As', async () => {
      const { controller, documentFiles, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      documentFiles.saveAsChoices.push('C:\\Docs\\Copy.md');

      await controller.execute({ kind: 'saveDocumentAs' });

      expect(documentFiles.savedSources).toEqual([{ kind: 'copy', path: GUIDE }]);
      await vi.waitFor(() => expect(tabNames(snapshot())).toEqual(['Copy.md']));
    });

    it('saves every new document with Save All and stops when the user cancels', async () => {
      const { controller, documentFiles, snapshot } = await viewerWithNewDocument([GUIDE]);
      controller.openAsNewDocument('| b |');
      controller.openAsNewDocument('| c |');
      documentFiles.saveAsChoices.push(TABLE, undefined);

      await controller.execute({ kind: 'saveAllDocuments' });

      expect(documentFiles.savedSources).toHaveLength(2);
      await vi.waitFor(() =>
        expect(tabNames(snapshot())).toEqual(['Guide.md', 'Table.md', 'Untitled-2.md', 'Untitled-3.md']),
      );
    });

    it('asks before closing a new document, and closes it without saving on Don’t Save', async () => {
      const { controller, documentFiles, snapshot } = await viewerWithNewDocument([GUIDE]);

      await controller.execute({ kind: 'closeActiveTab' });
      expect(snapshot().unsavedChanges).toEqual({ fileNames: ['Untitled-1.md'] });
      expect(tabNames(snapshot())).toEqual(['Guide.md', 'Untitled-1.md']);
      await controller.answerUnsavedChanges('discard');

      expect(snapshot()).not.toHaveProperty('unsavedChanges');
      expect(tabNames(snapshot())).toEqual(['Guide.md']);
      expect(documentFiles.savedSources).toEqual([]);
    });

    it('saves a new document before closing it on Save', async () => {
      const { controller, documentFiles, snapshot } = await viewerWithNewDocument([GUIDE]);
      documentFiles.saveAsChoices.push(TABLE);

      await controller.execute({ kind: 'closeActiveTab' });
      await controller.answerUnsavedChanges('save');

      expect(tabNames(snapshot())).toEqual(['Guide.md']);
      expect(await documentFiles.open(TABLE)).toMatchObject({ text: '| a |\n| - |' });
    });

    it('keeps a new document open when the user cancels, or cancels the Save dialog', async () => {
      const { controller, snapshot } = await viewerWithNewDocument();

      await controller.execute({ kind: 'closeActiveTab' });
      await controller.answerUnsavedChanges('cancel');
      await controller.execute({ kind: 'closeActiveTab' });
      await controller.answerUnsavedChanges('save');

      expect(tabNames(snapshot())).toEqual(['Untitled-1.md']);
    });

    it('closes other saved tabs without asking', async () => {
      const { controller, snapshot } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();

      await controller.execute({ kind: 'closeInactiveTabs' });

      expect(snapshot()).not.toHaveProperty('unsavedChanges');
      expect(tabNames(snapshot())).toEqual(['Notes.md']);
    });

    it('asks before the window closes and lets it close after Don’t Save', async () => {
      const { controller } = await viewerWithNewDocument();

      expect(controller.hasUnsavedDocuments()).toBe(true);
      const mayClose = controller.confirmClosingWindow();
      await controller.answerUnsavedChanges('discard');

      expect(await mayClose).toBe(true);
    });

    it('keeps the window open when the user cancels closing it', async () => {
      const { controller } = await viewerWithNewDocument();

      const mayClose = controller.confirmClosingWindow();
      await controller.answerUnsavedChanges('cancel');

      expect(await mayClose).toBe(false);
    });

    it('reports a save that fails', async () => {
      const { controller, documentFiles, snapshot } = await viewerWithNewDocument();
      documentFiles.saveAs = () => Promise.reject(new Error('disk full'));

      await controller.execute({ kind: 'saveDocument' });

      expect(snapshot().notice).toContain('Untitled-1.md could not be saved');
    });

    it('never stars, watches or checks the file status of a new document', async () => {
      const { controller, watcher, snapshot } = await viewerWithNewDocument([GUIDE]);

      await controller.execute({ kind: 'toggleFavourite' });
      await vi.advanceTimersByTimeAsync(0);

      expect(snapshot().viewer.favourites.favourites()).toEqual([]);
      expect(watcher.watchedPaths).toEqual([GUIDE]);
      expect([...snapshot().pathStatuses.keys()]).not.toContain('untitled:1');
    });
  });

  describe('app menu', () => {
    it('runs the command of a chosen menu item', async () => {
      const { controller, menu, snapshot } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();

      menu.choose('closeActiveTab');

      await vi.waitFor(() => expect(tabNames(snapshot())).toEqual(['Guide.md']));
    });

    it('shows the current view settings in the menu and keeps them up to date', async () => {
      const { controller, menu } = createViewer();
      await controller.start();
      expect(menu.shownViewState).toEqual({
        theme: 'system',
        readingWidth: 'medium',
        isSidebarVisible: true,
        isOutlineVisible: true,
        isStatusBarVisible: true,
        isSourceView: false,
      });

      menu.choose('theme.dark');

      await vi.waitFor(() => expect(menu.shownViewState?.theme).toBe('dark'));
    });

    it('checks Source View in the menu while the source is shown', async () => {
      const { controller, menu } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.execute({ kind: 'toggleSourceView' });

      expect(menu.shownViewState?.isSourceView).toBe(true);
    });

    it('lists recent documents under Open Recent and opens the chosen one', async () => {
      const { controller, menu, snapshot } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();
      await controller.execute({ kind: 'closeActiveTab' });
      await vi.waitFor(() => expect(menu.shownRecentFiles).toEqual([NOTES, GUIDE]));

      menu.choose('openRecent.0');

      await vi.waitFor(() => expect(tabNames(snapshot())).toEqual(['Guide.md', 'Notes.md']));
    });

    it('ignores an Open Recent item that is no longer in the list', async () => {
      const { controller, snapshot } = createViewer();
      await controller.start();

      await controller.execute({ kind: 'openRecentFileAt', index: 5 });

      expect(tabNames(snapshot())).toEqual([]);
    });

    it('opens find from the menu, asks to refocus it when opened again, and closes it', async () => {
      const { controller, menu, snapshot } = createViewer();
      await controller.start();

      menu.choose('showFind');
      await vi.waitFor(() => expect(snapshot().findRequest).toBe(1));
      menu.choose('showFind');
      await vi.waitFor(() => expect(snapshot().findRequest).toBe(2));
      controller.closeFind();

      expect(snapshot()).not.toHaveProperty('findRequest');
    });

    it('opens and closes the About dialog', async () => {
      const { controller, menu, snapshot } = createViewer();
      await controller.start();

      menu.choose('showAbout');
      await vi.waitFor(() => expect(snapshot().openDialog).toBe('about'));
      controller.closeDialog();

      expect(snapshot()).not.toHaveProperty('openDialog');
    });

    it('opens the keyboard shortcuts from the Help menu', async () => {
      const { controller, menu, snapshot } = createViewer();
      await controller.start();

      menu.choose('showKeyboardShortcuts');

      await vi.waitFor(() => expect(snapshot().openDialog).toBe('keyboardShortcuts'));
    });
  });

  describe('reopen with encoding', () => {
    it('reopens the active document with the chosen encoding and shows it in the status bar', async () => {
      const { controller, documentFiles, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();

      await controller.execute({ kind: 'reopenWithEncoding', encoding: 'windows-1252' });

      await vi.waitFor(() => expect(snapshot().activeDocument?.encoding).toBe('windows-1252'));
      expect(documentFiles.openedEncodings.at(-1)).toBe('windows-1252');
    });

    it('reports a document that cannot be reopened', async () => {
      const { controller, documentFiles, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      documentFiles.delete(GUIDE);

      await controller.execute({ kind: 'reopenWithEncoding', encoding: 'big5' });

      expect(snapshot().notice).toContain('could not be reopened with that encoding');
    });
  });

  describe('recent files that have moved', () => {
    const MOVED = 'C:\\Archive\\Guide.md';

    async function viewerWithMovedGuide() {
      const viewer = createViewer({ startupPaths: [GUIDE] });
      await viewer.controller.start();
      await viewer.controller.execute({ kind: 'toggleFavourite' });
      await viewer.controller.execute({ kind: 'closeActiveTab' });
      viewer.documentFiles.delete(GUIDE);
      viewer.documentFiles.write(MOVED, '# Guide');
      const [guide] = viewer.session.currentState().recentFiles.entries();
      if (!guide) throw new Error('Guide.md is missing from recent files');
      await viewer.controller.openRecentFile(guide);
      return viewer;
    }

    it('offers Locate and Remove when a recent file cannot be found', async () => {
      const { snapshot } = await viewerWithMovedGuide();

      expect(snapshot().notice).toContain('could not be found');
      expect(snapshot().noticeActions?.map((action) => action.label)).toEqual([
        'Locate…',
        'Remove from List',
      ]);
    });

    it('points the recent file and the favourite at the located file and opens it', async () => {
      const { controller, requests, session, snapshot } = await viewerWithMovedGuide();
      requests.pickedPaths = [MOVED];
      const [locate] = snapshot().noticeActions ?? [];
      if (!locate) throw new Error('no Locate action');

      await controller.runNoticeAction(locate);

      const { recentFiles, favourites } = session.currentState();
      expect(recentFiles.entries().map((file) => file.location.displayPath)).toEqual([MOVED]);
      expect(favourites.favourites().map((favourite) => favourite.location.displayPath)).toEqual([MOVED]);
      expect(tabNames(snapshot())).toEqual(['Guide.md']);
      expect(snapshot()).not.toHaveProperty('notice');
    });

    it('removes the recent file when the user chooses Remove', async () => {
      const { controller, session, snapshot } = await viewerWithMovedGuide();
      const remove = snapshot().noticeActions?.[1];
      if (!remove) throw new Error('no Remove action');

      await controller.runNoticeAction(remove);

      expect(session.currentState().recentFiles.entries()).toEqual([]);
    });
  });

  describe('favourites file', () => {
    it('exports the favourites and says where they were saved', async () => {
      const { controller, favouritesFile, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      await controller.execute({ kind: 'toggleFavourite' });
      favouritesFile.exportPath = 'C:\\Backup\\favourites.json';

      await controller.execute({ kind: 'exportFavourites' });

      const [exported] = favouritesFile.exportedFiles;
      expect(exported?.suggestedFileName).toBe('MDX favourites.json');
      expect(
        parseFavouritesFile(exported?.contents ?? '')
          ?.favourites()
          .map((f) => f.location.fileName),
      ).toEqual(['Guide.md']);
      expect(snapshot().notice).toBe('Favourites exported to C:\\Backup\\favourites.json.');
    });

    it('says nothing when the user cancels the export', async () => {
      const { controller, snapshot } = createViewer();
      await controller.start();

      await controller.execute({ kind: 'exportFavourites' });

      expect(snapshot()).not.toHaveProperty('notice');
    });

    it('imports favourites, adding only the ones that are new', async () => {
      const { controller, favouritesFile, session, snapshot } = createViewer({ startupPaths: [GUIDE] });
      await controller.start();
      await controller.execute({ kind: 'toggleFavourite' });
      const exported = FavouritesList.empty()
        .add(InMemoryDocumentFiles.locationOf(GUIDE), 'file')
        .add(InMemoryDocumentFiles.locationOf(NOTES), 'file');
      favouritesFile.importedText = toFavouritesFile(exported);

      await controller.execute({ kind: 'importFavourites' });

      expect(
        session
          .currentState()
          .favourites.favourites()
          .map((favourite) => favourite.location.fileName),
      ).toEqual(['Guide.md', 'Notes.md']);
      expect(snapshot().notice).toBe('Imported 1 favourite.');
    });

    it('rejects a file that is not an exported favourites file', async () => {
      const { controller, favouritesFile, snapshot } = createViewer();
      await controller.start();
      favouritesFile.importedText = '{"hello":"world"}';

      await controller.execute({ kind: 'importFavourites' });

      expect(snapshot().notice).toBe('That file is not a favourites file exported from MDX.');
    });
  });

  describe('sidebar', () => {
    it('renames, reorders and removes favourites and manages recent files through commands', async () => {
      const { controller, session } = createViewer({ startupPaths: [GUIDE, NOTES] });
      await controller.start();
      await controller.execute({ kind: 'toggleFavourite' });
      const notesKey = session.currentState().tabStrip.activeTab()?.location.canonicalKey ?? '';

      await controller.execute({ kind: 'renameFavourite', canonicalKey: notesKey, label: 'My notes' });
      await controller.execute({ kind: 'pinRecentFile', canonicalKey: notesKey });
      await controller.execute({ kind: 'clearUnpinnedRecentFiles' });

      expect(session.currentState().favourites.favourites()[0]?.label).toBe('My notes');
      expect(
        session
          .currentState()
          .recentFiles.entries()
          .map((entry) => entry.location.fileName),
      ).toEqual(['Notes.md']);
    });

    it('reports favourites and recent files whose files have disappeared', async () => {
      const first = createViewer({ startupPaths: [GUIDE] });
      await first.controller.start();
      await first.controller.execute({ kind: 'toggleFavourite' });
      await first.controller.execute({ kind: 'closeActiveTab' });
      await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);
      first.controller.stop();

      const second = createViewer({ appState: first.appState });
      second.documentFiles.delete(GUIDE);
      await second.controller.start();

      await vi.waitFor(() => expect([...second.snapshot().pathStatuses.values()]).toEqual(['missing']));
    });
  });
});
