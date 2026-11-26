import { InMemoryAppState, InMemoryDocumentFiles, InMemoryWorkspaceStore } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ViewerSession } from './ViewerSession';

function createSession(workspaceStore = new InMemoryWorkspaceStore(), appState = new InMemoryAppState()) {
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles(),
    appState,
    workspaceStore,
    now: () => 1_000,
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  return { session, workspaceStore, appState };
}

const themeOf = (session: ViewerSession) => session.currentState().viewSettings.theme;

describe('per-workspace settings overrides', () => {
  it('an override applies only to its workspace', async () => {
    const { session } = createSession();
    await session.restore();
    session.updateViewSettings((settings) => ({ ...settings, theme: 'light' }));
    await session.createWorkspace({ name: 'Reading', kindId: 'markdownViewer' });

    session.setWorkspaceOverride('theme', true);
    session.updateViewSettings((settings) => ({ ...settings, theme: 'dark' }));
    const themeInReading = themeOf(session);
    await session.switchWorkspace('default');

    expect(themeInReading).toBe('dark');
    expect(themeOf(session)).toBe('light');
  });

  it('clearing falls back to the app value', async () => {
    const { session } = createSession();
    await session.restore();
    session.updateViewSettings((settings) => ({ ...settings, theme: 'light' }));
    session.setWorkspaceOverride('theme', true);
    session.updateViewSettings((settings) => ({ ...settings, theme: 'dark' }));

    session.setWorkspaceOverride('theme', false);

    expect(themeOf(session)).toBe('light');
  });

  it('starting an override keeps what is shown', async () => {
    const { session } = createSession();
    await session.restore();
    session.updateViewSettings((settings) => ({ ...settings, readingWidth: 'wide' }));

    session.setWorkspaceOverride('readingWidth', true);

    expect(session.currentState().viewSettings.readingWidth).toBe('wide');
    expect(session.currentState().workspaceOverrides).toEqual({ readingWidth: 'wide' });
  });

  it('zoom stays app-wide', async () => {
    const { session } = createSession();
    await session.restore();
    session.setWorkspaceOverride('theme', true);
    await session.createWorkspace({ name: 'Reading', kindId: 'markdownViewer' });

    session.updateViewSettings((settings) => ({ ...settings, zoomPercent: 150 }));
    await session.switchWorkspace('default');

    expect(session.currentState().viewSettings.zoomPercent).toBe(150);
  });

  it('keeps overrides after a restart, and the earlier-version copy keeps the app value', async () => {
    const first = createSession();
    await first.session.restore();
    first.session.updateViewSettings((settings) => ({ ...settings, theme: 'light' }));
    first.session.setWorkspaceOverride('theme', true);
    first.session.updateViewSettings((settings) => ({ ...settings, theme: 'nord' }));
    await first.session.save();

    const second = createSession(first.workspaceStore, first.appState);
    await second.session.restore();

    expect(themeOf(second.session)).toBe('nord');
    expect(await first.appState.load()).toMatchObject({ view: { theme: 'light' } });
  });

  it('does nothing without workspaces', async () => {
    const session = new ViewerSession({
      documentFiles: new InMemoryDocumentFiles(),
      appState: new InMemoryAppState(),
      now: () => 0,
    });
    await session.restore();

    session.setWorkspaceOverride('theme', true);

    expect(session.currentState().workspaceOverrides).toBeUndefined();
  });

  it('keeps the shown state identical between changes', async () => {
    const { session } = createSession();
    await session.restore();
    session.setWorkspaceOverride('theme', true);

    expect(session.currentState()).toBe(session.currentState());
  });
});
