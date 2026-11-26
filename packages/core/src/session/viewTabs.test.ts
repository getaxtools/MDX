import { InMemoryAppState, InMemoryDocumentFiles, viewLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ViewerSession } from './ViewerSession';

const GUIDE_PATH = 'C:\\Docs\\Guide.md';
const DASHBOARD = viewLocation('spec-dashboard:c:\\projects\\shop|', 'Dashboard - shop');

function createSession(appState = new InMemoryAppState()) {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE_PATH]: '# Guide' });
  let clockMs = 0;
  const session = new ViewerSession({ documentFiles, appState, now: () => (clockMs += 1) });
  return { session, documentFiles, appState };
}

function tabKeysOf(session: ViewerSession): string[] {
  return session
    .currentState()
    .tabStrip.tabs()
    .map((tab) => tab.location.canonicalKey);
}

describe('view tabs', () => {
  it('opens a view in a tab without reading a file or adding it to recent files', async () => {
    const { session, documentFiles } = createSession();

    session.openView(DASHBOARD);

    expect(tabKeysOf(session)).toEqual([DASHBOARD.canonicalKey]);
    expect(await session.loadActiveDocument()).toBeUndefined();
    expect(documentFiles.openedPaths).toEqual([]);
    expect(session.currentState().recentFiles.entries()).toEqual([]);
  });

  it('focuses the open tab when the same view is opened again', async () => {
    const { session } = createSession();
    session.openView(DASHBOARD);
    await session.openDocument(GUIDE_PATH);

    session.openView(DASHBOARD);

    expect(tabKeysOf(session)).toEqual([DASHBOARD.canonicalKey, 'c:\\docs\\guide.md']);
    expect(session.currentState().tabStrip.activeTab()?.location).toEqual(DASHBOARD);
  });

  it('is dropped when the window is saved, so a restart does not reopen it', async () => {
    const { session, appState } = createSession();
    await session.openDocument(GUIDE_PATH);
    session.openView(DASHBOARD);

    await session.save();
    const { session: restarted } = createSession(appState);
    await restarted.restore();

    expect(tabKeysOf(restarted)).toEqual(['c:\\docs\\guide.md']);
  });

  it('is not reloaded when a file of the same name changes', async () => {
    const { session, documentFiles } = createSession();
    session.openView(DASHBOARD);

    await session.reloadDocuments([DASHBOARD.displayPath]);

    expect(documentFiles.openedPaths).toEqual([]);
  });
});
