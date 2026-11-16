import { codePointAfter, codePointBefore } from '../codePoints';
import { charactersIn, spanOf, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { adjacentRuns, type HiddenCharacter } from './scanHiddenCharacters';

const RULE_ID = 'char-invisible-filler';

function isSetMember(input: CharacterRuleInput, setName: string, codePoint: number | undefined): boolean {
  return codePoint !== undefined && input.ruleset.codepointSet(setName).has(codePoint);
}

/** Braille blanks separate braille words, and jamo fillers complete a syllable that lacks a part. */
function isLegitimateFiller(input: CharacterRuleInput, run: readonly HiddenCharacter[]): boolean {
  const { from, to } = spanOf(run);
  const before = codePointBefore(input.text, from);
  const after = codePointAfter(input.text, to);
  const codePoints = run.map((character) => character.codePoint);
  if (codePoints.every((codePoint) => isSetMember(input, 'brailleBlank', codePoint)))
    return isSetMember(input, 'braillePatterns', before) || isSetMember(input, 'braillePatterns', after);
  if (codePoints.length !== 1) return false;
  return (
    (isSetMember(input, 'hangulChoseongFiller', codePoints[0]) &&
      isSetMember(input, 'hangulJungseong', after)) ||
    (isSetMember(input, 'hangulJungseongFiller', codePoints[0]) &&
      isSetMember(input, 'hangulChoseong', before))
  );
}

export function findInvisibleFillers(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  return adjacentRuns(charactersIn(input, 'invisibleFillers')).flatMap((run) =>
    isLegitimateFiller(input, run) ? [] : [{ ruleId: RULE_ID, ...spanOf(run), severity: rule.severity }],
  );
}
