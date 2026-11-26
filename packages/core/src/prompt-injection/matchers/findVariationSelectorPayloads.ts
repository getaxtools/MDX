import { codePointBefore } from '../codePoints';
import { decodeVariationSelectorPayload } from '../decoders/decodeVariationSelectorPayload';
import { numberParameter } from '../Ruleset';
import { charactersIn, spanOf, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { adjacentRuns, type HiddenCharacter } from './scanHiddenCharacters';

const RULE_ID = 'char-variation-selectors';

/** One emoji or text presentation selector is normal, and so is one ideographic selector after a Han ideograph. */
function isLegitimateSingleSelector(input: CharacterRuleInput, selector: HiddenCharacter): boolean {
  const isSupplementary = input.ruleset
    .codepointSet('supplementaryVariationSelectors')
    .has(selector.codePoint);
  if (!isSupplementary) return true;
  const base = codePointBefore(input.text, selector.from);
  return base !== undefined && input.ruleset.codepointSet('hanIdeographs').has(base);
}

export function findVariationSelectorPayloads(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const minimumRunLength = numberParameter(rule, 'minimumRunLength');
  return adjacentRuns(charactersIn(input, 'variationSelectors')).flatMap((run) => {
    const [first] = run;
    if (!first) return [];
    if (run.length < minimumRunLength && isLegitimateSingleSelector(input, first)) return [];
    return [
      {
        ruleId: RULE_ID,
        ...spanOf(run),
        severity: rule.severity,
        decoded: decodeVariationSelectorPayload(run.map((selector) => selector.codePoint)),
        messageArguments: { count: run.length },
      },
    ];
  });
}
