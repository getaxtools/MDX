import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppMenu,
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
  InMemoryDocumentWatcher,
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
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, session, requests, documentFiles, appState, menu, watcher, links, folders, snapshot };
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
      });

      menu.choose('theme.dark');

      await vi.waitFor(() => expect(menu.shownViewState?.theme).toBe('dark'));
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
