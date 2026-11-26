import { WorkspaceKindsState, WorkspaceRegistry, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { StoredWorkspace } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { commandForMenuItem } from '../viewer/viewerCommands';
import { recentWorkspaceLinks } from './recentWorkspaceLinks';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

function stored(kindId: string, name: string | null, lastShownAtMs: number): StoredWorkspace {
  const id = (name ?? 'default').toLowerCase();
  return { id, kindId, name, icon: null, colour: null, position: 0, lastShownAtMs };
}

const VIEW = {
  registry: WorkspaceRegistry.fromStored([
    stored('markdownViewer', null, 30),
    stored('markdownViewer', 'Reading', 20),
    stored('notes', 'Journal', 25),
    stored('kindFromTheFuture', 'Later', 40),
  ]),
  shownWorkspaceId: 'default',
};

function kindsWith(enabledKindIds: readonly string[]): WorkspaceKindsState {
  return WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId: 'markdownViewer' }, ALL_KINDS_BUILT);
}

describe('recentWorkspaceLinks', () => {
  it('lists the other workspaces, most recently used first, with their kind', () => {
    const links = recentWorkspaceLinks(VIEW, kindsWith(['markdownViewer', 'notes']), createTranslator());

    expect(links).toEqual([
      { id: 'journal', name: 'Journal', kindName: 'Notes' },
      { id: 'reading', name: 'Reading', kindName: 'Markdown viewer' },
    ]);
  });

  it('recent workspaces exclude disabled and unknown kinds', () => {
    const links = recentWorkspaceLinks(VIEW, kindsWith(['markdownViewer']), createTranslator());

    expect(links.map((link) => link.id)).toEqual(['reading']);
  });

  it('a recent workspace in the Open Recent menu switches to it', () => {
    expect(commandForMenuItem('openRecentWorkspace.reading')).toEqual({
      kind: 'switchWorkspace',
      workspaceId: 'reading',
    });
  });
});
