import { isAgentFileLocation, Ruleset, type AutomaticInjectionCheck, type DocumentOrigin } from '@mdx/core';

export interface AutomaticCheckCandidate {
  readonly origin: DocumentOrigin;
  readonly location?: string;
  /** Spec project files and other documents a caller knows agents read. */
  readonly isAgentContext?: boolean;
}

/** Whether a document is checked as soon as it is shown, without the user asking. */
export function shouldCheckAutomatically(
  candidate: AutomaticCheckCandidate,
  setting: AutomaticInjectionCheck,
): boolean {
  if (setting === 'off') return false;
  if (setting === 'allDocuments') return true;
  return (
    candidate.origin === 'remote' ||
    candidate.isAgentContext === true ||
    isAgentFileLocation(candidate.location, Ruleset.bundled())
  );
}
