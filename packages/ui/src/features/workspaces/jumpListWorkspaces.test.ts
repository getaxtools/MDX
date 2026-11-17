import { ViewerSession, WorkspaceKindsState, WorkspaceRegistry, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryJumpList,
  InMemoryWorkspaceStore,
  type StoredWorkspace,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';
import { jumpListNameOf, jumpListWorkspacesOf } from './jumpListWorkspaces';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

function stored(kindId: string, name: string, lastShownAtMs: number): StoredWorkspace {
  return { id: name.toLowerCase(), kindId, name, icon: null, colour: null, position: 0, lastShownAtMs };
}

function kindsWith(enabledKindIds: readonly string[]): WorkspaceKindsState {
  return WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId: 'markdownViewer' }, ALL_KINDS_BUILT);
}

describe('jumpListWorkspacesOf', () => {
  it('the Jump List model lists 5 recent enabled workspaces and no protected content', () => {
    const registry = WorkspaceRegistry.fromStored([
      stored('markdownViewer', 'One', 10),
      stored('notes', 'Journal', 70),
      stored('markdownViewer', 'Two', 20),
      stored('markdownViewer', 'Three', 30),
      stored('markdownViewer', 'Four', 40),
      stored('markdownViewer', 'Five', 50),
      stored('markdownViewer', 'Six', 60),
    ]);

    const workspaces = jumpListWorkspacesOf(registry, kindsWith(['markdownViewer']), {
      translator: createTranslator(),
      removals: {},
    });

    expect(workspaces).toEqual([
      { id: 'six', name: 'Six' },
      { id: 'five', name: 'Five' },
      { id: 'four', name: 'Four' },
      { id: 'three', name: 'Three' },
      { id: 'two', name: 'Two' },
    ]);
    expect(workspaces.every((workspace) => Object.keys(workspace).join() === 'id,name')).toBe(true);
  });
});

describe('jumpListNameOf', () => {
  it('strips direction controls, zero-width characters and separators from a name', () => {
    const translator = createTranslator();

    expect(jumpListNameOf('\u202ERe\u200Bad\u2066ing\u2069\u061C\uFEFF\u2028\u2029', translator)).toBe(
      'Reading',
    );
  });

  it('gives a name with nothing visible left the default name, so the list still updates', () => {
    expect(jumpListNameOf('\u200E\u202A \u0007', createTranslator())).toBe('Default');
  });
});

describe('a removed Jump List entry', () => {
  it('stays out until its workspace is shown again', () => {
    const registry = (shownAtMs: number) =>
      WorkspaceRegistry.fromStored([
        stored('markdownViewer', 'One', 10),
        stored('markdownViewer', 'Two', shownAtMs),
      ]);
    const options = { translator: createTranslator(), removals: { two: 50 } };
    const kinds = kindsWith(['markdownViewer']);

    expect(jumpListWorkspacesOf(registry(40), kinds, options).map((workspace) => workspace.id)).toEqual([
      'one',
    ]);
    expect(jumpListWorkspacesOf(registry(60), kinds, options).map((workspace) => workspace.id)).toEqual([
      'two',
      'one',
    ]);
  });
});

describe('the Jump List of a running app', () => {
  async function start(jumpList: InMemoryJumpList) {
    let nextId = 0;
    const session = new ViewerSession({
      documentFiles: new InMemoryDocumentFiles({}),
      appState: new InMemoryAppState(),
      workspaceStore: new InMemoryWorkspaceStore(),
      kindRegistry: ALL_KINDS_BUILT,
      now: () => 1_000 + nextId,
      createId: () => `workspace-${String((nextId += 1))}`,
    });
    const controller = new ViewerController({
      session,
      requests: new InMemoryDocumentRequests(),
      renderer: createMarkdownRenderer({ window }),
      translator: createTranslator(),
      jumpList,
    });
    let latest: ViewerSnapshot | undefined;
    controller.subscribe((snapshot) => (latest = snapshot));
    await controller.start();
    return {
      controller,
      session,
      shownName: () => latest?.workspaces?.registry.find(latest.workspaces.shownWorkspaceId)?.name,
    };
  }

  it('lists the workspaces under its own category as they are shown', async () => {
    const jumpList = new InMemoryJumpList();
    const { controller } = await start(jumpList);

    await controller.execute({ kind: 'createWorkspace', name: 'Reading', kindId: 'markdownViewer' });

    const last = jumpList.shownLists.at(-1);
    expect(last?.category).toBe('Workspaces');
    expect(last?.workspaces.map((workspace) => workspace.name)).toContain('Reading');
  });

  it('sends one update at a time, the newest list last', async () => {
    const jumpList = new InMemoryJumpList();
    const { controller } = await start(jumpList);
    jumpList.isHeld = true;

    await controller.execute({ kind: 'createWorkspace', name: 'Reading', kindId: 'markdownViewer' });
    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'markdownViewer' });
    jumpList.release();
    await vi.waitFor(() => expect(jumpList.shownLists.at(-1)?.workspaces[0]?.name).toBe('Plans'));

    expect(jumpList.mostAtOnce).toBe(1);
  });

  it('remembers a removed entry and leaves it out of the next list', async () => {
    const jumpList = new InMemoryJumpList();
    const { controller, session } = await start(jumpList);
    await controller.execute({ kind: 'createWorkspace', name: 'Reading', kindId: 'markdownViewer' });
    await vi.waitFor(() =>
      expect(jumpList.shownLists.at(-1)?.workspaces.map((workspace) => workspace.name)).toContain('Reading'),
    );
    const readingId =
      jumpList.shownLists.at(-1)?.workspaces.find((workspace) => workspace.name === 'Reading')?.id ?? '';
    jumpList.removedWorkspaceIds = [readingId];

    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'markdownViewer' });

    await vi.waitFor(() =>
      expect(Object.keys(session.currentState().jumpListRemovals ?? {})).toEqual([readingId]),
    );
    await vi.waitFor(() =>
      expect(jumpList.shownLists.at(-1)?.workspaces.map((workspace) => workspace.id)).not.toContain(
        readingId,
      ),
    );
  });

  it('a refusal leaves the app working', async () => {
    const jumpList = new InMemoryJumpList();
    jumpList.outcome = 'refusedByPrivacySetting';
    const { controller, shownName } = await start(jumpList);

    await controller.execute({ kind: 'createWorkspace', name: 'Reading', kindId: 'markdownViewer' });
    jumpList.isFailing = true;
    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'markdownViewer' });

    expect(shownName()).toBe('Plans');
    expect(jumpList.shownLists.length).toBeGreaterThanOrEqual(2);
  });
});
