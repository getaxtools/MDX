import type { FormulaRefusal, FormulaWriteOutcome } from '@mdx/editor';
import type { Translator } from '@mdx/i18n';
import type { FormulaProblem } from './FormulaPreviewer';

/** What the dialog shows under the source, with the character an error is at counted from 1. */
export function formulaProblemText(problem: FormulaProblem | undefined, translator: Translator): string {
  if (!problem) return '';
  if (problem.kind === 'tooLong') return translator.translate('equation.tooLong', { limit: problem.limit });
  if (problem.kind === 'unavailable') return translator.translate('equation.unavailable');
  return problem.position === undefined
    ? translator.translate('equation.error', { message: problem.message })
    : translator.translate('equation.errorAt', { message: problem.message, position: problem.position + 1 });
}

/**
 * What screen readers hear: the error without its position, so typing on while the same error
 * stays does not announce it again.
 */
export function formulaProblemAnnouncement(
  problem: FormulaProblem | undefined,
  translator: Translator,
): string {
  if (problem?.kind !== 'error') return formulaProblemText(problem, translator);
  return translator.translate('equation.error', { message: problem.message });
}

/** Refusals the user can fix by changing the source; the others close the equation editor. */
export type SourceRefusal = Extract<FormulaRefusal, 'dollarEndsInlineFormula' | 'dollarsEndDisplayFormula'>;

export function isRefusalOfTheSource(outcome: FormulaWriteOutcome): outcome is SourceRefusal {
  return outcome === 'dollarEndsInlineFormula' || outcome === 'dollarsEndDisplayFormula';
}

export function sourceRefusalText(refusal: SourceRefusal, translator: Translator): string {
  return translator.translate(`equation.${refusal}`);
}
