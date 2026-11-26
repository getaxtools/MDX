import { codePointBefore } from '../codePoints';
import { decodeTagCharacters } from '../decoders/decodeTagCharacters';
import { numberParameter } from '../Ruleset';
import { charactersIn, spanOf, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { adjacentRuns, type HiddenCharacter } from './scanHiddenCharacters';

const RULE_ID = 'char-unicode-tags';

/**
 * A subdivision flag such as England's is a black flag, 1 to 32 tag letters or digits and a cancel tag.
 * Returns how many characters at the start of the run belong to such a flag, 0 when there is none.
 */
function emojiFlagLength(
  input: CharacterRuleInput,
  run: readonly HiddenCharacter[],
  maxTagLength: number,
): number {
  const flagBase = input.ruleset.codepointSet('emojiTagBase');
  const specification = input.ruleset.codepointSet('emojiTagSpecification');
  const cancelTag = input.ruleset.codepointSet('cancelTag');
  const base = codePointBefore(input.text, run[0]?.from ?? 0);
  if (base === undefined || !flagBase.has(base)) return 0;
  const specificationLength = run.findIndex((character) => !specification.has(character.codePoint));
  const isWellFormed =
    specificationLength >= 1 &&
    specificationLength <= maxTagLength &&
    cancelTag.has(run[specificationLength]?.codePoint ?? -1);
  return isWellFormed ? specificationLength + 1 : 0;
}

export function findTagCharacters(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const maxTagLength = numberParameter(rule, 'maxEmojiTagLength');
  return adjacentRuns(charactersIn(input, 'tagCharacters')).flatMap((run) => {
    const hiddenRun = run.slice(emojiFlagLength(input, run, maxTagLength));
    if (hiddenRun.length === 0) return [];
    const { from, to } = spanOf(hiddenRun);
    const decoded = decodeTagCharacters(input.text.slice(from, to));
    return [
      {
        ruleId: RULE_ID,
        from,
        to,
        severity: rule.severity,
        ...(decoded === '' ? {} : { decoded }),
        messageArguments: { count: hiddenRun.length },
      },
    ];
  });
}
