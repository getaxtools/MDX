import { WorkspaceKindsState, WorkspaceRegistry, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { StoredWorkspace } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { switcherGroups } from './switcherGroups';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const translator = createTranslator();

function stored(id: string, kindId: string, name: string | null): StoredWorkspace {
  return { id, kindId, name, icon: null, colour: null, position: 0, lastShownAtMs: 0 };
}

function shownAt(workspace: StoredWorkspace, lastShownAtMs: number): StoredWorkspace {
  return { ...workspace, lastShownAtMs };
}

const REGISTRY = WorkspaceRegistry.fromStored([
  shownAt(stored('default', 'markdownViewer', null), 10),
  shownAt(stored('handbook', 'markdownViewer', 'Handbook'), 30),
  shownAt(stored('reading', 'markdownViewer', 'Reading'), 20),
  shownAt(stored('journal', 'notes', 'Journal'), 40),
]);

function kindsWith(enabledKindIds: readonly string[]): WorkspaceKindsState {
  return WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId: 'markdownViewer' }, ALL_KINDS_BUILT);
}

function namesByKind(filter: string, enabledKindIds: readonly string[] = ['markdownViewer', 'notes']) {
  const source = { registry: REGISTRY, shownWorkspaceId: 'default', kinds: kindsWith(enabledKindIds) };
  return switcherGroups(source, filter, translator).map((group) => [
    group.kindName,
    group.entries.map((entry) => entry.name),
  ]);
}

describe('switcherGroups', () => {
  it('ordering and grouping: kinds in their order, most recently used first', () => {
    expect(namesByKind('')).toEqual([
      ['Markdown viewer', ['Handbook', 'Reading', 'Default']],
      ['Notes', ['Journal']],
    ]);
  });

  it('the filter matches names and drops empty groups', () => {
    expect(namesByKind('rea')).toEqual([['Markdown viewer', ['Reading']]]);
  });

  it('leaves out workspaces of disabled kinds', () => {
    expect(namesByKind('', ['markdownViewer'])).toEqual([
      ['Markdown viewer', ['Handbook', 'Reading', 'Default']],
    ]);
  });

  it('marks the workspace the window shows and the letters that matched', () => {
    const source = { registry: REGISTRY, shownWorkspaceId: 'reading', kinds: kindsWith(['markdownViewer']) };

    const [reading] = switcherGroups(source, 'rea', translator)[0]?.entries ?? [];

    expect(reading?.isShown).toBe(true);
    expect(reading?.matchedIndexes).toEqual([0, 1, 2]);
  });
});
