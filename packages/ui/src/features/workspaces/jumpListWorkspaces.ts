import {
  isRemovedFromJumpList,
  type JumpListRemovals,
  type WorkspaceKindsState,
  type WorkspaceRegistry,
} from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { JumpListWorkspace } from '@mdx/platform';
import { workspaceNameOf } from './workspaceCommands';

/** The Jump List shows at most this many recent workspaces. */
export const MAX_JUMP_LIST_WORKSPACES = 5;

/** Direction controls, zero-width characters and line or paragraph separators hide or reorder a name. */
const HIDDEN_IN_A_NAME = /[\p{Cc}\u061C\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/gu;

/** A name as the taskbar shows it; one with nothing visible left falls back to the default name. */
export function jumpListNameOf(name: string, translator: Translator): string {
  const shown = name.replace(HIDDEN_IN_A_NAME, '').trim();
  return shown === '' ? translator.translate('workspaces.defaultName') : shown;
}

/**
 * The workspaces of enabled kinds shown most recently, the shown one included, as the taskbar lists
 * them: only an id and a name, never a path, a document or a note. A workspace whose entry the user
 * removed stays out until it is shown again.
 */
export function jumpListWorkspacesOf(
  registry: WorkspaceRegistry,
  kinds: WorkspaceKindsState,
  { translator, removals }: { readonly translator: Translator; readonly removals: JumpListRemovals },
): JumpListWorkspace[] {
  return registry
    .recentlyShown(kinds)
    .filter((workspace) => !isRemovedFromJumpList(workspace, removals))
    .slice(0, MAX_JUMP_LIST_WORKSPACES)
    .map((workspace) => ({
      id: workspace.id,
      name: jumpListNameOf(workspaceNameOf(workspace, translator), translator),
    }));
}
