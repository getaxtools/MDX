import { shiftSeverity, type InjectionSeverity } from './injectionSeverity';

/** Steps a rule's severity moves in each context, from the rule data; a missing context means no change. */
export interface SeverityEscalation {
  readonly hidden?: number;
  readonly agentFile?: number;
  readonly codeExample?: number;
  readonly negated?: number;
}

export interface FindingContext {
  /** The text sits where a reader does not see it: a comment, hidden HTML, a title or a decoded payload. */
  readonly isHidden: boolean;
  readonly isAgentFile: boolean;
  /** Inside a code span or code block, where documents show commands and prompts as examples. */
  readonly isInCodeExample: boolean;
  /** A word such as "never" or "forbidden" comes just before the matched phrase. */
  readonly isNegated: boolean;
}

export const PLAIN_FINDING_CONTEXT: FindingContext = {
  isHidden: false,
  isAgentFile: false,
  isInCodeExample: false,
  isNegated: false,
};

/**
 * Adds up the steps of every context that applies, then caps the result at High and floors it at Info,
 * so a hidden phrase inside a code example ends where it started. Code examples only lower findings in
 * normal documents: in an agent file a code block is still read as instructions.
 */
export function escalateSeverity(
  baseSeverity: InjectionSeverity,
  escalation: SeverityEscalation,
  context: FindingContext,
): InjectionSeverity {
  const isCodeExampleInNormalDocument = context.isInCodeExample && !context.isAgentFile;
  const steps =
    stepsWhen(context.isHidden, escalation.hidden) +
    stepsWhen(context.isAgentFile, escalation.agentFile) +
    stepsWhen(isCodeExampleInNormalDocument, escalation.codeExample) +
    stepsWhen(context.isNegated, escalation.negated);
  return shiftSeverity(baseSeverity, steps);
}

function stepsWhen(applies: boolean, steps: number | undefined): number {
  return applies ? (steps ?? 0) : 0;
}
