export type ProtectedNotesCommand =
  | { readonly kind: 'showProtectedSetUp' }
  | { readonly kind: 'setUpProtectedSection'; readonly password: string }
  | { readonly kind: 'finishProtectedSetUp' }
  | { readonly kind: 'unlockProtectedSection'; readonly password: string; readonly shouldRemember: boolean }
  | { readonly kind: 'unlockProtectedOnThisPc' }
  | {
      readonly kind: 'unlockProtectedWithRecoveryKey';
      readonly recoveryKey: string;
      readonly newPassword: string;
    }
  | { readonly kind: 'acceptProtectedFolder' }
  | { readonly kind: 'forgetProtectedOnThisPc' }
  | { readonly kind: 'openProtectedNote'; readonly noteId: string }
  | { readonly kind: 'createProtectedNote'; readonly title: string }
  | { readonly kind: 'lockProtectedNotes' }
  | { readonly kind: 'confirmProtectedLock' }
  | { readonly kind: 'cancelProtectedLock' };

const PROTECTED_NOTES_COMMAND_KINDS: ReadonlySet<string> = new Set<ProtectedNotesCommand['kind']>([
  'showProtectedSetUp',
  'setUpProtectedSection',
  'finishProtectedSetUp',
  'unlockProtectedSection',
  'unlockProtectedOnThisPc',
  'unlockProtectedWithRecoveryKey',
  'acceptProtectedFolder',
  'forgetProtectedOnThisPc',
  'openProtectedNote',
  'createProtectedNote',
  'lockProtectedNotes',
  'confirmProtectedLock',
  'cancelProtectedLock',
]);

export function isProtectedNotesCommand(command: {
  readonly kind: string;
}): command is ProtectedNotesCommand {
  return PROTECTED_NOTES_COMMAND_KINDS.has(command.kind);
}
