import type { KindToggleResult, WorkspaceKindsState } from './WorkspaceKindsState';
import type { WorkspaceKind, WorkspaceKindId } from './workspaceKinds';

/** `later` is a planned kind, listed before it is built. */
export type KindsPageStatus = 'active' | 'on' | 'off' | 'later';

/** `lockedOn` is the last enabled kind, which cannot be turned off; `none` means the card has no switch. */
export type KindSwitchState = 'on' | 'off' | 'lockedOn' | 'none';

export interface KindsPageEntry {
  readonly kindId: WorkspaceKindId;
  readonly status: KindsPageStatus;
  readonly canBeChosen: boolean;
  readonly switchState: KindSwitchState;
}

/** One card per kind, in the order of the kind list. */
export function kindsPageEntriesOf(state: WorkspaceKindsState): readonly KindsPageEntry[] {
  return state.kinds().map((kind) => entryFor(kind, state));
}

/** Flips a kind's switch; the enablement rules may refuse it. */
export function flipKindSwitch(state: WorkspaceKindsState, kindId: WorkspaceKindId): KindToggleResult {
  return state.isEnabled(kindId) ? state.disableKind(kindId) : state.enableKind(kindId);
}

function entryFor(kind: WorkspaceKind, state: WorkspaceKindsState): KindsPageEntry {
  return {
    kindId: kind.id,
    status: statusOf(kind, state),
    canBeChosen: state.isEnabled(kind.id),
    switchState: switchStateOf(kind, state),
  };
}

function statusOf(kind: WorkspaceKind, state: WorkspaceKindsState): KindsPageStatus {
  if (kind.availability === 'planned') return 'later';
  if (kind.id === state.activeKindId()) return 'active';
  return state.isEnabled(kind.id) ? 'on' : 'off';
}

function switchStateOf(kind: WorkspaceKind, state: WorkspaceKindsState): KindSwitchState {
  if (kind.availability === 'planned') return 'none';
  if (!state.isEnabled(kind.id)) return 'off';
  return state.isLastEnabled(kind.id) ? 'lockedOn' : 'on';
}
