import type { StoredWorkspace } from '@mdx/platform';
import { restoreAppState, type NewerSavedState } from '../session/persistedAppState';
import { DEFAULT_WORKSPACE_KIND_ID, type WorkspaceKind } from '../workspace-kinds/workspaceKinds';
import { DEFAULT_WORKSPACE_ID, storedViewerStateOf, type StoredViewerState } from './storedViewerState';

/** Everything the first start of the workspaces version writes, in one transaction. */
export interface WorkspaceMigration extends StoredViewerState {
  readonly workspace: StoredWorkspace;
  readonly wasReset: boolean;
  readonly newerSavedState: NewerSavedState | undefined;
}

/** Moves the earlier single state into the Default workspace; invalid entries are dropped as before. */
export function migrateLegacyAppState(
  saved: unknown,
  { kindRegistry, nowMs }: { readonly kindRegistry: readonly WorkspaceKind[]; readonly nowMs: number },
): WorkspaceMigration {
  const restored = restoreAppState(saved, kindRegistry);
  return {
    workspace: {
      id: DEFAULT_WORKSPACE_ID,
      kindId: DEFAULT_WORKSPACE_KIND_ID,
      name: null,
      icon: null,
      colour: null,
      position: 0,
      lastShownAtMs: nowMs,
    },
    ...storedViewerStateOf(restored),
    wasReset: restored.wasReset,
    newerSavedState: restored.newerSavedState,
  };
}
