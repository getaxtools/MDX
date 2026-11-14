import type { StoredWorkspace } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { workspaceKindsFor } from '../workspace-kinds/workspaceKinds';
import { WorkspaceKindsState } from '../workspace-kinds/WorkspaceKindsState';
import { WorkspaceRegistry } from './WorkspaceRegistry';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

function stored(id: string, kindId: string, name: string | null): StoredWorkspace {
  return { id, kindId, name, icon: null, colour: null, position: 0, lastShownAtMs: 0 };
}

function shownAt(workspace: StoredWorkspace, lastShownAtMs: number): StoredWorkspace {
  return { ...workspace, lastShownAtMs };
}

function kindsWith(enabledKindIds: readonly string[]): WorkspaceKindsState {
  return WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId: 'markdownViewer' }, ALL_KINDS_BUILT);
}

const DEFAULT = stored('default', 'markdownViewer', null);
const MARKDOWN_ONLY = WorkspaceKindsState.initial();

describe('WorkspaceRegistry', () => {
  it('create picks only enabled available kinds', () => {
    const registry = WorkspaceRegistry.fromStored([DEFAULT]);

    const notesWhenPlanned = registry.create(
      { id: 'n', name: 'Journal', kindId: 'notes', nowMs: 1 },
      MARKDOWN_ONLY,
    );
    const notesWhenDisabled = registry.create(
      { id: 'n', name: 'Journal', kindId: 'notes', nowMs: 1 },
      kindsWith(['markdownViewer']),
    );
    const notesWhenEnabled = registry.create(
      { id: 'n', name: 'Journal', kindId: 'notes', nowMs: 1 },
      kindsWith(['markdownViewer', 'notes']),
    );

    expect(notesWhenPlanned).toEqual({ outcome: 'refused', problem: 'kindNotChoosable' });
    expect(notesWhenDisabled).toEqual({ outcome: 'refused', problem: 'kindNotChoosable' });
    expect(notesWhenEnabled.outcome).toBe('changed');
  });

  it('creates a named workspace after the others, trimmed and shown now', () => {
    const change = WorkspaceRegistry.fromStored([DEFAULT]).create(
      { id: 'handbook', name: '  Handbook ', kindId: 'markdownViewer', colour: 'teal', nowMs: 5 },
      MARKDOWN_ONLY,
    );

    expect(change.outcome === 'changed' && change.workspace).toEqual({
      id: 'handbook',
      kindId: 'markdownViewer',
      name: 'Handbook',
      icon: null,
      colour: 'teal',
      position: 1,
      lastShownAtMs: 5,
    });
  });

  it('duplicate name in a kind is refused ignoring case', () => {
    const registry = WorkspaceRegistry.fromStored([DEFAULT, stored('h', 'markdownViewer', 'Handbook')]);

    expect(registry.checkName('handbook', 'markdownViewer')).toBe('duplicate');
    expect(registry.checkName('handbook', 'notes')).toBeUndefined();
    expect(registry.checkName('Handbook', 'markdownViewer', 'h')).toBeUndefined();
  });

  it('refuses empty and overlong names', () => {
    const registry = WorkspaceRegistry.fromStored([DEFAULT]);

    expect(registry.checkName('   ', 'markdownViewer')).toBe('empty');
    expect(registry.checkName('n'.repeat(101), 'markdownViewer')).toBe('tooLong');
    expect(registry.checkName('n'.repeat(100), 'markdownViewer')).toBeUndefined();
  });

  it('renames a workspace and keeps the name rules', () => {
    const registry = WorkspaceRegistry.fromStored([DEFAULT, stored('h', 'markdownViewer', 'Handbook')]);

    const renamed = registry.rename('default', 'Reading');

    expect(renamed.outcome === 'changed' && renamed.registry.find('default')?.name).toBe('Reading');
    expect(registry.rename('default', 'HANDBOOK')).toEqual({ outcome: 'refused', problem: 'duplicate' });
  });

  it('the last Markdown viewer workspace cannot be deleted', () => {
    const registry = WorkspaceRegistry.fromStored([DEFAULT, stored('n', 'notes', 'Journal')]);

    expect(registry.canRemove('default')).toBe(false);
    expect(registry.remove('default')).toEqual({ outcome: 'refused', problem: 'lastMarkdownViewer' });
    expect(registry.remove('n').outcome).toBe('removed');
  });

  it('deletes a Markdown viewer workspace while another one remains', () => {
    const registry = WorkspaceRegistry.fromStored([DEFAULT, stored('h', 'markdownViewer', 'Handbook')]);

    const removal = registry.remove('default');

    expect(
      removal.outcome === 'removed' && removal.registry.workspaces().map((workspace) => workspace.id),
    ).toEqual(['h']);
  });

  it("a disabled kind's workspace is hidden and kept", () => {
    const journal = stored('n', 'notes', 'Journal');
    const registry = WorkspaceRegistry.fromStored([DEFAULT, journal]);

    expect(registry.visibilityOf(journal, kindsWith(['markdownViewer']))).toBe('hiddenWithKind');
    expect(registry.recentlyShown(kindsWith(['markdownViewer']))).toEqual([DEFAULT]);
    expect(registry.workspaces()).toContain(journal);
  });

  it("an unknown kind's workspace is unavailable and kept", () => {
    const fromTheFuture = stored('f', 'kindFromTheFuture', 'Later');
    const registry = WorkspaceRegistry.fromStored([DEFAULT, fromTheFuture]);

    expect(registry.visibilityOf(fromTheFuture, MARKDOWN_ONLY)).toBe('unavailable');
    expect(registry.workspaces()).toContain(fromTheFuture);
  });

  it('lists the most recently shown workspaces first', () => {
    const registry = WorkspaceRegistry.fromStored([
      shownAt(stored('a', 'markdownViewer', 'A'), 10),
      shownAt(stored('b', 'markdownViewer', 'B'), 30),
      shownAt(stored('c', 'markdownViewer', 'C'), 20),
    ]);

    expect(registry.recentlyShown(MARKDOWN_ONLY).map((workspace) => workspace.id)).toEqual(['b', 'c', 'a']);
  });

  it('choosing a kind opens its last workspace, or the first one never shown', () => {
    const registry = WorkspaceRegistry.fromStored([
      shownAt(stored('j', 'notes', 'Journal'), 30),
      shownAt(stored('w', 'notes', 'Work'), 10),
      DEFAULT,
    ]);

    expect(registry.lastShownOfKind('notes')?.id).toBe('j');
    expect(registry.lastShownOfKind('markdownViewer')?.id).toBe('default');
    expect(registry.lastShownOfKind('specViewer')).toBeUndefined();
  });
});
