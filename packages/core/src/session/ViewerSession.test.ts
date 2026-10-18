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
