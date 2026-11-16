import type { IgnoreScope, InjectionFinding } from '@mdx/core';

export type InjectionCheckCommand =
  | { readonly kind: 'checkForPromptInjection' }
  | { readonly kind: 'revealInjectionFinding'; readonly finding: InjectionFinding }
  | {
      readonly kind: 'ignoreInjectionFinding';
      readonly finding: InjectionFinding;
      readonly scope: IgnoreScope;
    }
  | { readonly kind: 'showInjectionFindingAgain'; readonly finding: InjectionFinding };

const INJECTION_CHECK_COMMAND_KINDS: ReadonlySet<string> = new Set<InjectionCheckCommand['kind']>([
  'checkForPromptInjection',
  'revealInjectionFinding',
  'ignoreInjectionFinding',
  'showInjectionFindingAgain',
]);

export function isInjectionCheckCommand(command: {
  readonly kind: string;
}): command is InjectionCheckCommand {
  return INJECTION_CHECK_COMMAND_KINDS.has(command.kind);
}
