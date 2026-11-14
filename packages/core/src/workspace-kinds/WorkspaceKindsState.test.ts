import { describe, expect, it } from 'vitest';
import { WorkspaceKindsState } from './WorkspaceKindsState';
import type { WorkspaceKind } from './workspaceKinds';

const ALL_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'built' },
];

const NOTES_PLANNED: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'planned' },
  { id: 'specViewer', availability: 'built' },
];

function withEnabled(enabledKindIds: string[], activeKindId: string, registry = ALL_BUILT) {
  return WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId }, registry);
}

describe('WorkspaceKindsState', () => {
  it('starts with only the Markdown viewer enabled and active', () => {
    const state = WorkspaceKindsState.initial();

    expect(state.enabledKindIds()).toEqual(['markdownViewer']);
    expect(state.activeKindId()).toBe('markdownViewer');
  });

  describe('turning kinds on and off', () => {
    it('adds a built kind in the order of the kind list', () => {
      const state = withEnabled(['markdownViewer', 'specViewer'], 'markdownViewer');

      const { state: changed, outcome } = state.enableKind('notes');

      expect(outcome).toBe('enabled');
      expect(changed.enabledKindIds()).toEqual(['markdownViewer', 'notes', 'specViewer']);
    });

    it('refuses to turn on a planned kind', () => {
      const state = WorkspaceKindsState.initial(NOTES_PLANNED);

      const { state: changed, outcome } = state.enableKind('notes');

      expect(outcome).toBe('refusedUnavailable');
      expect(changed.enabledKindIds()).toEqual(['markdownViewer']);
    });

    it('refuses to turn on an unknown kind', () => {
      expect(WorkspaceKindsState.initial(ALL_BUILT).enableKind('calendar').outcome).toBe(
        'refusedUnavailable',
      );
    });

    it('changes nothing when a kind is already on or already off', () => {
      const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

      expect(state.enableKind('notes')).toEqual({ state, outcome: 'unchanged' });
      expect(state.disableKind('specViewer')).toEqual({ state, outcome: 'unchanged' });
    });

    it('turns off a kind that is not active and keeps the active one', () => {
      const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

      const { state: changed, outcome } = state.disableKind('notes');

      expect(outcome).toBe('disabled');
      expect(changed.enabledKindIds()).toEqual(['markdownViewer']);
      expect(changed.activeKindId()).toBe('markdownViewer');
    });

    it('keeps the last enabled kind on', () => {
      const state = WorkspaceKindsState.initial();

      const { state: changed, outcome } = state.disableKind('markdownViewer');

      expect(outcome).toBe('refusedLastEnabled');
      expect(changed.enabledKindIds()).toEqual(['markdownViewer']);
      expect(changed.activeKindId()).toBe('markdownViewer');
    });

    it('switches to the next enabled kind when the active kind is turned off', () => {
      const state = withEnabled(['markdownViewer', 'notes', 'specViewer'], 'notes');

      const { state: changed, outcome } = state.disableKind('notes');

      expect(outcome).toBe('disabledActive');
      expect(changed.activeKindId()).toBe('specViewer');
      expect(changed.enabledKindIds()).toEqual(['markdownViewer', 'specViewer']);
    });

    it('wraps to the first enabled kind when the last kind in the order is turned off', () => {
      const state = withEnabled(['markdownViewer', 'specViewer'], 'specViewer');

      const { state: changed } = state.disableKind('specViewer');

      expect(changed.activeKindId()).toBe('markdownViewer');
    });
  });

  describe('switching kind', () => {
    it('makes another enabled kind active', () => {
      const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

      expect(state.switchKind('notes').activeKindId()).toBe('notes');
    });

    it('changes nothing for the active kind', () => {
      const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

      expect(state.switchKind('markdownViewer')).toBe(state);
    });

    it('changes nothing for a disabled, planned or unknown kind', () => {
      const state = withEnabled(['markdownViewer'], 'markdownViewer', NOTES_PLANNED);

      expect(state.switchKind('specViewer')).toBe(state);
      expect(state.switchKind('notes')).toBe(state);
      expect(state.switchKind('calendar')).toBe(state);
    });
  });

  describe('reading saved choices', () => {
    it('drops unknown, planned and repeated kinds', () => {
      const state = withEnabled(
        ['markdownViewer', 'calendar', 'notes', 'markdownViewer', 'specViewer'],
        'markdownViewer',
        NOTES_PLANNED,
      );

      expect(state.enabledKindIds()).toEqual(['markdownViewer', 'specViewer']);
    });

    it('sorts enabled kinds into the order of the kind list', () => {
      const state = withEnabled(['specViewer', 'markdownViewer'], 'specViewer');

      expect(state.enabledKindIds()).toEqual(['markdownViewer', 'specViewer']);
      expect(state.activeKindId()).toBe('specViewer');
    });

    it.each([
      ['missing', undefined],
      ['not an object', 'markdownViewer'],
      ['without a list', { activeKindId: 'notes' }],
      ['with no valid kind', { enabledKindIds: ['calendar'], activeKindId: 'calendar' }],
      ['empty', { enabledKindIds: [], activeKindId: 'markdownViewer' }],
    ])('falls back to the Markdown viewer when the saved value is %s', (_description, saved) => {
      const state = WorkspaceKindsState.fromSaved(saved, ALL_BUILT);

      expect(state.enabledKindIds()).toEqual(['markdownViewer']);
      expect(state.activeKindId()).toBe('markdownViewer');
    });

    it('moves an active kind that is not enabled to the first enabled kind', () => {
      const state = withEnabled(['notes', 'specViewer'], 'markdownViewer');

      expect(state.activeKindId()).toBe('notes');
    });

    it('saves what it restores', () => {
      const state = withEnabled(['markdownViewer', 'notes'], 'notes');

      expect(WorkspaceKindsState.fromSaved(state.toSaved(), ALL_BUILT)).toEqual(state);
    });
  });
});
