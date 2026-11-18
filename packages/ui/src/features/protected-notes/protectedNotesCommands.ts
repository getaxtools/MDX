export type ProtectedNotesCommand =
  | { readonly kind: 'showProtectedSetUp' }
  | { readonly kind: 'setUpProtectedSection'; readonly password: string }
  | { readonly kind: 'finishProtectedSetUp' };

const PROTECTED_NOTES_COMMAND_KINDS: ReadonlySet<string> = new Set<ProtectedNotesCommand['kind']>([
  'showProtectedSetUp',
  'setUpProtectedSection',
  'finishProtectedSetUp',
]);

export function isProtectedNotesCommand(command: {
  readonly kind: string;
}): command is ProtectedNotesCommand {
  return PROTECTED_NOTES_COMMAND_KINDS.has(command.kind);
}
