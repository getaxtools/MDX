import type { WorkspaceKindId, WorkspaceNameProblem } from '@mdx/core';
import type { StoredWorkspace } from '@mdx/platform';
import type { Translator } from '@mdx/i18n';
import { kindNameOf } from '../control-wheel/kindPresentation';

export type WorkspaceCommand =
  | { readonly kind: 'showNewWorkspace'; readonly kindId?: WorkspaceKindId }
  | { readonly kind: 'createWorkspace'; readonly name: string; readonly kindId: WorkspaceKindId }
  | { readonly kind: 'showRenameWorkspace' }
  | { readonly kind: 'renameWorkspace'; readonly name: string }
  | { readonly kind: 'confirmDeleteWorkspace' }
  | { readonly kind: 'deleteWorkspace' }
  | { readonly kind: 'switchWorkspace'; readonly workspaceId: string };

const WORKSPACE_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'showNewWorkspace',
  'createWorkspace',
  'showRenameWorkspace',
  'renameWorkspace',
  'confirmDeleteWorkspace',
  'deleteWorkspace',
  'switchWorkspace',
]);

export function isWorkspaceCommand(command: { readonly kind: string }): command is WorkspaceCommand {
  return WORKSPACE_COMMAND_KINDS.has(command.kind);
}

/** The Default workspace shows its name in the display language until the user renames it. */
export function workspaceNameOf(workspace: StoredWorkspace, translator: Translator): string {
  return workspace.name ?? translator.translate('workspaces.defaultName');
}

export function nameProblemMessage(
  problem: WorkspaceNameProblem,
  kindId: WorkspaceKindId,
  translator: Translator,
): string {
  if (problem === 'duplicate')
    return translator.translate('workspaces.nameProblem.duplicate', { kind: kindNameOf(kindId, translator) });
  return translator.translate(
    problem === 'empty' ? 'workspaces.nameProblem.empty' : 'workspaces.nameProblem.tooLong',
  );
}
