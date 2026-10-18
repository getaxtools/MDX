import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryAppState, InMemoryDocumentFiles, InMemoryDocumentRequests } from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATE_SAVE_DELAY_MS, ViewerController, type ViewerSnapshot } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';

function createViewer({ startupPaths = [] as string[], appState = new InMemoryAppState() } = {}) {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [NOTES]: '# Notes' });
  const requests = new InMemoryDocumentRequests(startupPaths);
  const session = new ViewerSession({ documentFiles, appState, now: () => Date.now() });
  const controller = new ViewerController({
    session,
    requests,
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, session, requests, documentFiles, appState, snapshot };
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
});
