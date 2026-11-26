import { codePointLength } from '../codePoints';
import { charactersIn, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { hiddenCharactersOf } from './scanHiddenCharacters';

const RULE_ID = 'char-private-use';
// Unassigned code points and unpaired surrogates have no fixed list; the regex engine knows both.
const UNASSIGNED_OR_UNPAIRED = /[\p{Cn}\p{Cs}]/gu;

interface Occurrence {
  readonly from: number;
  readonly to: number;
}

function unassignedOrUnpaired(input: CharacterRuleInput): Occurrence[] {
  const otherRulesCharacters = hiddenCharactersOf(input.ruleset);
  return [...input.text.matchAll(UNASSIGNED_OR_UNPAIRED)].flatMap((match) => {
    const codePoint = match[0].codePointAt(0) ?? 0;
    if (otherRulesCharacters.has(codePoint)) return [];
    return [{ from: match.index, to: match.index + codePointLength(codePoint) }];
  });
}

/** Icon fonts put glyphs in the private use area, so all such code points make one low finding. */
export function findPrivateUseCharacters(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const occurrences = [...charactersIn(input, 'privateUseCharacters'), ...unassignedOrUnpaired(input)];
  if (occurrences.length === 0) return [];
  const first = occurrences.reduce((earliest, occurrence) =>
    occurrence.from < earliest.from ? occurrence : earliest,
  );
  return [
    {
      ruleId: RULE_ID,
      from: first.from,
      to: first.to,
      severity: rule.severity,
      messageArguments: { count: occurrences.length },
    },
  ];
}
