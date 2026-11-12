import { isRecord } from '../session/savedValues';
import {
  DEFAULT_WORKSPACE_KIND_ID,
  isBuiltKind,
  WORKSPACE_KINDS,
  type WorkspaceKind,
  type WorkspaceKindId,
} from './workspaceKinds';

export interface SavedWorkspaceKinds {
  readonly enabledKindIds: readonly WorkspaceKindId[];
  readonly activeKindId: WorkspaceKindId;
}

/** What turning a kind on or off did; `disabledActive` means the active kind was turned off and another is shown. */
export type KindToggleOutcome =
  'enabled' | 'disabled' | 'disabledActive' | 'unchanged' | 'refusedLastEnabled' | 'refusedUnavailable';

export interface KindToggleResult {
  readonly state: WorkspaceKindsState;
  readonly outcome: KindToggleOutcome;
}

/** Which workspace kinds are turned on, in the fixed order of the kind list, and which one the window shows. */
export class WorkspaceKindsState {
  private constructor(
    private readonly registry: readonly WorkspaceKind[],
    private readonly enabledIds: readonly WorkspaceKindId[],
    private readonly activeId: WorkspaceKindId,
  ) {}

  static initial(registry: readonly WorkspaceKind[] = WORKSPACE_KINDS): WorkspaceKindsState {
    return new WorkspaceKindsState(registry, [DEFAULT_WORKSPACE_KIND_ID], DEFAULT_WORKSPACE_KIND_ID);
  }

  /** Reads saved choices, dropping unknown, planned and repeated kinds instead of failing. */
  static fromSaved(
    saved: unknown,
    registry: readonly WorkspaceKind[] = WORKSPACE_KINDS,
  ): WorkspaceKindsState {
    if (!isRecord(saved) || !Array.isArray(saved.enabledKindIds))
      return WorkspaceKindsState.initial(registry);
    const savedIds: unknown[] = saved.enabledKindIds;
    const enabledIds = registry
      .filter((kind) => kind.availability === 'built' && savedIds.includes(kind.id))
      .map((kind) => kind.id);
    const [firstEnabledId] = enabledIds;
    if (firstEnabledId === undefined) return WorkspaceKindsState.initial(registry);
    const activeId = enabledIds.find((kindId) => kindId === saved.activeKindId) ?? firstEnabledId;
    return new WorkspaceKindsState(registry, enabledIds, activeId);
  }

  kinds(): readonly WorkspaceKind[] {
    return this.registry;
  }

  enabledKindIds(): readonly WorkspaceKindId[] {
    return this.enabledIds;
  }

  activeKindId(): WorkspaceKindId {
    return this.activeId;
  }

  isEnabled(kindId: string): boolean {
    return this.enabledIds.some((enabledId) => enabledId === kindId);
  }

  enableKind(kindId: string): KindToggleResult {
    if (!isBuiltKind(this.registry, kindId)) return { state: this, outcome: 'refusedUnavailable' };
    if (this.isEnabled(kindId)) return { state: this, outcome: 'unchanged' };
    const enabledIds = this.registry
      .map((kind) => kind.id)
      .filter((id) => id === kindId || this.isEnabled(id));
    return { state: new WorkspaceKindsState(this.registry, enabledIds, this.activeId), outcome: 'enabled' };
  }

  disableKind(kindId: string): KindToggleResult {
    if (!this.isEnabled(kindId)) return { state: this, outcome: 'unchanged' };
    if (this.enabledIds.length === 1) return { state: this, outcome: 'refusedLastEnabled' };
    const enabledIds = this.enabledIds.filter((id) => id !== kindId);
    if (kindId !== this.activeId) {
      return {
        state: new WorkspaceKindsState(this.registry, enabledIds, this.activeId),
        outcome: 'disabled',
      };
    }
    const nextActiveId = this.nextEnabledAfter(kindId, enabledIds);
    return {
      state: new WorkspaceKindsState(this.registry, enabledIds, nextActiveId),
      outcome: 'disabledActive',
    };
  }

  /** Shows another enabled kind; any other kind, including the active one, leaves the state as it is. */
  switchKind(kindId: string): WorkspaceKindsState {
    const enabledId = this.enabledIds.find((id) => id === kindId);
    if (enabledId === undefined || enabledId === this.activeId) return this;
    return new WorkspaceKindsState(this.registry, this.enabledIds, enabledId);
  }

  toSaved(): SavedWorkspaceKinds {
    return { enabledKindIds: this.enabledIds, activeKindId: this.activeId };
  }

  private nextEnabledAfter(kindId: WorkspaceKindId, enabledIds: readonly WorkspaceKindId[]): WorkspaceKindId {
    const order = this.registry.map((kind) => kind.id);
    const position = order.indexOf(kindId);
    const kindsAfterThenBefore = [...order.slice(position + 1), ...order.slice(0, position)];
    return kindsAfterThenBefore.find((id) => enabledIds.includes(id)) ?? DEFAULT_WORKSPACE_KIND_ID;
  }
}
