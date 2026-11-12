import type { WorkspaceKindsState } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { kindNameOf } from './kindPresentation';

export type WorkspaceKindCommand =
  | { readonly kind: 'switchWorkspaceKind'; readonly kindId: string }
  | { readonly kind: 'setWorkspaceKindEnabled'; readonly kindId: string; readonly isEnabled: boolean };

export interface WorkspaceKindNotice {
  readonly key: MessageKey;
  readonly values?: Readonly<Record<string, string>>;
}

export interface WorkspaceKindChange {
  readonly state: WorkspaceKindsState;
  /** What to tell the user; nothing when the command changed nothing they need to hear about. */
  readonly notice?: WorkspaceKindNotice;
}

export function isWorkspaceKindCommand(command: { readonly kind: string }): command is WorkspaceKindCommand {
  return command.kind === 'switchWorkspaceKind' || command.kind === 'setWorkspaceKindEnabled';
}

export function applyWorkspaceKindCommand(
  state: WorkspaceKindsState,
  command: WorkspaceKindCommand,
  translator: Translator,
): WorkspaceKindChange {
  if (command.kind === 'switchWorkspaceKind') return switchKind(state, command.kindId, translator);
  if (command.isEnabled) return { state: state.enableKind(command.kindId).state };
  return disableKind(state, command.kindId, translator);
}

function switchKind(state: WorkspaceKindsState, kindId: string, translator: Translator): WorkspaceKindChange {
  const switched = state.switchKind(kindId);
  if (switched === state) return { state };
  return {
    state: switched,
    notice: {
      key: 'workspaceKinds.notice.shown',
      values: { kind: kindNameOf(switched.activeKindId(), translator) },
    },
  };
}

function disableKind(
  state: WorkspaceKindsState,
  kindId: string,
  translator: Translator,
): WorkspaceKindChange {
  const { state: changed, outcome } = state.disableKind(kindId);
  if (outcome === 'refusedLastEnabled') {
    return { state: changed, notice: { key: 'workspaceKinds.notice.lastEnabled' } };
  }
  if (outcome !== 'disabledActive') return { state: changed };
  return {
    state: changed,
    notice: {
      key: 'workspaceKinds.notice.turnedOffActive',
      values: {
        turnedOffKind: kindNameOf(state.activeKindId(), translator),
        kind: kindNameOf(changed.activeKindId(), translator),
      },
    },
  };
}
