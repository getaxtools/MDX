import type { WorkspaceColour, WorkspaceIcon, WorkspaceKindId, WorkspaceNameProblem } from '@mdx/core';
import type { StoredWorkspace } from '@mdx/platform';
import type { Translator } from '@mdx/i18n';
import { kindNameOf } from '../control-wheel/kindPresentation';

/** What the New Workspace dialog asks for. */
export interface WorkspaceDetails {
  readonly name: string;
  readonly kindId: WorkspaceKindId;
  readonly icon?: WorkspaceIcon | undefined;
  readonly colour?: WorkspaceColour | undefined;
  /** Opens the folder picker after a Markdown viewer workspace is created. */
  readonly isFolderStepChosen?: boolean;
}

export type WorkspaceCommand =
  | { readonly kind: 'showNewWorkspace'; readonly kindId?: WorkspaceKindId }
  | ({ readonly kind: 'createWorkspace' } & WorkspaceDetails)
  | { readonly kind: 'showRenameWorkspace' }
  | { readonly kind: 'renameWorkspace'; readonly name: string }
  | { readonly kind: 'confirmDeleteWorkspace' }
  | { readonly kind: 'deleteWorkspace' }
  | { readonly kind: 'switchWorkspace'; readonly workspaceId: string }
  | { readonly kind: 'showWorkspaceSwitcher' };

const WORKSPACE_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'showNewWorkspace',
  'createWorkspace',
  'showRenameWorkspace',
  'renameWorkspace',
  'confirmDeleteWorkspace',
  'deleteWorkspace',
  'switchWorkspace',
  'showWorkspaceSwitcher',
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
