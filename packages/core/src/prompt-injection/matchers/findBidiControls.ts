import { severityParameter } from '../Ruleset';
import { charactersIn, spanOf, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { adjacentRuns, type HiddenCharacter } from './scanHiddenCharacters';

const OVERRIDE_RULE_ID = 'char-bidi-override';
const UNBALANCED_RULE_ID = 'char-bidi-unbalanced';
const MARK_IN_CODE_RULE_ID = 'char-bidi-mark-in-code';

type OpenedScope = 'embedding' | 'isolate';

function isInCodeOrAddress(input: CharacterRuleInput, offset: number): boolean {
  return input.structure.isInCode(offset) || input.structure.isInAddress(offset);
}

export function findBidiOverrides(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(OVERRIDE_RULE_ID);
  const proseSeverity = severityParameter(rule, 'proseSeverity');
  return charactersIn(input, 'bidiOverrides').map((override) => {
    const isInCodeOrLink =
      isInCodeOrAddress(input, override.from) || input.structure.isInLinkText(override.from);
    return {
      ruleId: OVERRIDE_RULE_ID,
      from: override.from,
      to: override.to,
      severity: isInCodeOrLink ? rule.severity : proseSeverity,
    };
  });
}

/**
 * A line is balanced when every embedding or override is closed by PDF and every isolate by PDI, in
 * nesting order, before the line ends. The bidi algorithm resets at each paragraph, so a control left
 * open reorders the rest of its line: the Trojan Source trick.
 */
export function isBidiBalanced(input: CharacterRuleInput, controls: readonly HiddenCharacter[]): boolean {
  const sets = input.ruleset;
  const openedScopes: OpenedScope[] = [];
  for (const { codePoint } of controls) {
    if (sets.codepointSet('bidiEmbeddingOpeners').has(codePoint)) openedScopes.push('embedding');
    else if (sets.codepointSet('bidiIsolateOpeners').has(codePoint)) openedScopes.push('isolate');
    else {
      const closedScope = sets.codepointSet('popDirectionalIsolate').has(codePoint) ? 'isolate' : 'embedding';
      if (openedScopes.pop() !== closedScope) return false;
    }
  }
  return openedScopes.length === 0;
}

function controlsByLine(input: CharacterRuleInput): HiddenCharacter[][] {
  const lines = new Map<number, HiddenCharacter[]>();
  for (const control of charactersIn(input, 'bidiControls')) {
    const line = input.positions.lineOf(control.from);
    const controlsOnLine = lines.get(line);
    if (controlsOnLine) controlsOnLine.push(control);
    else lines.set(line, [control]);
  }
  return [...lines.values()];
}

export function findUnbalancedBidiControls(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(UNBALANCED_RULE_ID);
  return controlsByLine(input).flatMap((controls) => {
    const isInCode = controls.some((control) => input.structure.isInCode(control.from));
    if (!isInCode && isBidiBalanced(input, controls)) return [];
    return [{ ruleId: UNBALANCED_RULE_ID, ...spanOf(controls), severity: rule.severity }];
  });
}

export function findBidiMarksInCode(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(MARK_IN_CODE_RULE_ID);
  const marksInCode = charactersIn(input, 'bidiMarks').filter((mark) => isInCodeOrAddress(input, mark.from));
  return adjacentRuns(marksInCode).map((run) => ({
    ruleId: MARK_IN_CODE_RULE_ID,
    ...spanOf(run),
    severity: rule.severity,
  }));
}
