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
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';
import { jumpListWorkspacesOf } from './jumpListWorkspaces';

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

    const workspaces = jumpListWorkspacesOf(registry, kindsWith(['markdownViewer']), createTranslator());

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

  it('a refusal leaves the app working', async () => {
    const jumpList = new InMemoryJumpList();
    jumpList.answer = 'refusedByPrivacySetting';
    const { controller, shownName } = await start(jumpList);

    await controller.execute({ kind: 'createWorkspace', name: 'Reading', kindId: 'markdownViewer' });
    jumpList.isFailing = true;
    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'markdownViewer' });

    expect(shownName()).toBe('Plans');
    expect(jumpList.shownLists.length).toBeGreaterThanOrEqual(2);
  });
});
