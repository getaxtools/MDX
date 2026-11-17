import type { WorkspaceKindsState, WorkspaceRegistry } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { JumpListWorkspace } from '@mdx/platform';
import { workspaceNameOf } from './workspaceCommands';

/** The Jump List shows at most this many recent workspaces. */
export const MAX_JUMP_LIST_WORKSPACES = 5;

/**
 * The workspaces of enabled kinds shown most recently, the shown one included, as the taskbar lists
 * them: only an id and a name, never a path, a document or a note.
 */
export function jumpListWorkspacesOf(
  registry: WorkspaceRegistry,
  kinds: WorkspaceKindsState,
  translator: Translator,
): JumpListWorkspace[] {
  return registry
    .recentlyShown(kinds)
    .slice(0, MAX_JUMP_LIST_WORKSPACES)
    .map((workspace) => ({ id: workspace.id, name: workspaceNameOf(workspace, translator) }));
}
