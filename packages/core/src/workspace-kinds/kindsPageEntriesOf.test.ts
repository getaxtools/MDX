import { describe, expect, it } from 'vitest';
import { flipKindSwitch, kindsPageEntriesOf, type KindsPageEntry } from './kindsPageEntriesOf';
import { WorkspaceKindsState } from './WorkspaceKindsState';
import type { WorkspaceKind, WorkspaceKindId } from './workspaceKinds';

const ALL_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'built' },
];

const SPEC_VIEWER_PLANNED: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'planned' },
];

function withEnabled(enabledKindIds: string[], activeKindId: string, registry = ALL_BUILT) {
  return WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId }, registry);
}

function entryFor(state: WorkspaceKindsState, kindId: WorkspaceKindId): KindsPageEntry | undefined {
  return kindsPageEntriesOf(state).find((entry) => entry.kindId === kindId);
}

describe('kindsPageEntriesOf', () => {
  it('lists one entry per kind in the order of the kind list', () => {
    const state = withEnabled(['markdownViewer'], 'markdownViewer');

    const page = kindsPageEntriesOf(state);

    expect(page.map((entry) => entry.kindId)).toEqual(['markdownViewer', 'notes', 'specViewer']);
  });

  it('statuses follow the active and enabled kinds', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'notes');

    const page = kindsPageEntriesOf(state);

    expect(page.map((entry) => entry.status)).toEqual(['on', 'active', 'off']);
  });

  it("cards show each kind's status", () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

    const page = kindsPageEntriesOf(state);

    expect(page.map((entry) => entry.status)).toEqual(['active', 'on', 'off']);
  });

  it('a turned-off kind cannot be chosen', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

    const specViewer = entryFor(state, 'specViewer');

    expect(specViewer?.canBeChosen).toBe(false);
    expect(specViewer?.switchState).toBe('off');
  });

  it('active and turned-on kinds can be chosen', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

    const page = kindsPageEntriesOf(state);

    expect(page.map((entry) => entry.canBeChosen)).toEqual([true, true, false]);
  });

  it('choose a kind from its card makes it the active kind', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

    const chosen = state.switchKind('notes');

    expect(entryFor(chosen, 'notes')?.status).toBe('active');
    expect(entryFor(chosen, 'markdownViewer')?.status).toBe('on');
  });

  it("the last enabled kind's switch is locked", () => {
    const state = withEnabled(['markdownViewer'], 'markdownViewer');

    const page = kindsPageEntriesOf(state);

    expect(page.map((entry) => entry.switchState)).toEqual(['lockedOn', 'off', 'off']);
  });

  it('switches are not locked while two kinds are on', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

    const page = kindsPageEntriesOf(state);

    expect(page.map((entry) => entry.switchState)).toEqual(['on', 'on', 'off']);
  });

  it('the last enabled kind stays on when its switch is flipped', () => {
    const state = withEnabled(['markdownViewer'], 'markdownViewer');

    const { state: flipped, outcome } = flipKindSwitch(state, 'markdownViewer');

    expect(outcome).toBe('refusedLastEnabled');
    expect(flipped).toBe(state);
    expect(entryFor(flipped, 'markdownViewer')?.status).toBe('active');
  });

  it('a planned kind has no switch', () => {
    const state = withEnabled(['markdownViewer'], 'markdownViewer', SPEC_VIEWER_PLANNED);

    const specViewer = entryFor(state, 'specViewer');

    expect(specViewer?.status).toBe('later');
    expect(specViewer?.switchState).toBe('none');
    expect(specViewer?.canBeChosen).toBe(false);
  });

  it('turn a kind on makes its card on and choosable', () => {
    const state = withEnabled(['markdownViewer'], 'markdownViewer');

    const { state: flipped, outcome } = flipKindSwitch(state, 'specViewer');

    expect(outcome).toBe('enabled');
    expect(entryFor(flipped, 'specViewer')).toMatchObject({
      status: 'on',
      canBeChosen: true,
      switchState: 'on',
    });
  });

  it('turning off a kind that is not active keeps the active kind', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'markdownViewer');

    const { state: flipped, outcome } = flipKindSwitch(state, 'notes');

    expect(outcome).toBe('disabled');
    expect(kindsPageEntriesOf(flipped).map((entry) => entry.status)).toEqual(['active', 'off', 'off']);
  });

  it('turning off the active kind moves to the next one', () => {
    const state = withEnabled(['markdownViewer', 'notes', 'specViewer'], 'notes');

    const { state: flipped, outcome } = flipKindSwitch(state, 'notes');

    expect(outcome).toBe('disabledActive');
    expect(kindsPageEntriesOf(flipped).map((entry) => entry.status)).toEqual(['on', 'off', 'active']);
  });

  it('turning off the active kind moves to the next enabled kind, wrapping around', () => {
    const state = withEnabled(['markdownViewer', 'notes'], 'notes');

    const { state: flipped, outcome } = flipKindSwitch(state, 'notes');

    expect(outcome).toBe('disabledActive');
    expect(kindsPageEntriesOf(flipped).map((entry) => entry.status)).toEqual(['active', 'off', 'off']);
  });

  it('flipping the switch of a planned kind changes nothing', () => {
    const state = withEnabled(['markdownViewer'], 'markdownViewer', SPEC_VIEWER_PLANNED);

    const { state: flipped, outcome } = flipKindSwitch(state, 'specViewer');

    expect(outcome).toBe('refusedUnavailable');
    expect(flipped).toBe(state);
  });
});
