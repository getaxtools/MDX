import { codePointAfter, codePointBefore, codePointLength } from '../codePoints';
import type { InjectionSeverity } from '../injectionSeverity';
import { numberParameter, severityParameter, type InjectionRule } from '../Ruleset';
import { charactersIn, spanOf, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { adjacentRuns, type HiddenCharacter } from './scanHiddenCharacters';

const RULE_ID = 'char-zero-width';
// Emoji data changes with each Unicode release; the webview's own property data keeps new emoji joined.
const EXTENDED_PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;
const LETTER = /^\p{L}$/u;

function isPictographic(codePoint: number | undefined): boolean {
  return codePoint !== undefined && EXTENDED_PICTOGRAPHIC.test(String.fromCodePoint(codePoint));
}

/** The code point before the offset, stepping back over the presentation selector and skin tone of an emoji. */
function emojiBaseBefore(input: CharacterRuleInput, offset: number): number | undefined {
  const modifiers = input.ruleset.codepointSet('emojiPresentationModifiers');
  let position = offset;
  let codePoint = codePointBefore(input.text, position);
  while (codePoint !== undefined && modifiers.has(codePoint)) {
    position -= codePointLength(codePoint);
    codePoint = codePointBefore(input.text, position);
  }
  return codePoint;
}

function isEmojiJoiner(input: CharacterRuleInput, character: HiddenCharacter): boolean {
  if (!input.ruleset.codepointSet('zeroWidthJoiner').has(character.codePoint)) return false;
  return (
    isPictographic(emojiBaseBefore(input, character.from)) &&
    isPictographic(codePointAfter(input.text, character.to))
  );
}

function isBetween(input: CharacterRuleInput, character: HiddenCharacter, setName: string): boolean {
  const set = input.ruleset.codepointSet(setName);
  const before = codePointBefore(input.text, character.from);
  const after = codePointAfter(input.text, character.to);
  return before !== undefined && after !== undefined && set.has(before) && set.has(after);
}

/** After a letter of a joining script, and before another one or the end of the word (a Malayalam chillu). */
function isScriptJoiner(input: CharacterRuleInput, character: HiddenCharacter): boolean {
  if (!input.ruleset.codepointSet('scriptJoiners').has(character.codePoint)) return false;
  const joiningScripts = input.ruleset.codepointSet('joiningScripts');
  const before = codePointBefore(input.text, character.from);
  const after = codePointAfter(input.text, character.to);
  if (before === undefined || !joiningScripts.has(before)) return false;
  return after === undefined || joiningScripts.has(after) || !LETTER.test(String.fromCodePoint(after));
}

function isLegitimateJoiner(input: CharacterRuleInput, character: HiddenCharacter): boolean {
  const isMathOperatorInMath =
    input.ruleset.codepointSet('invisibleMathOperators').has(character.codePoint) &&
    input.structure.isInMath(character.from);
  return isEmojiJoiner(input, character) || isScriptJoiner(input, character) || isMathOperatorInMath;
}

function isWordBreakHint(input: CharacterRuleInput, character: HiddenCharacter): boolean {
  return (
    input.ruleset.codepointSet('zeroWidthSpace').has(character.codePoint) &&
    isBetween(input, character, 'wordBreakHintScripts')
  );
}

/** Long runs, or runs that alternate two characters like ones and zeros, are how text is hidden in binary. */
function isPayloadRun(rule: InjectionRule, run: readonly HiddenCharacter[]): boolean {
  const distinctCount = new Set(run.map((character) => character.codePoint)).size;
  return (
    run.length >= numberParameter(rule, 'longRunLength') ||
    (distinctCount === 2 && run.length >= numberParameter(rule, 'alternatingRunLength'))
  );
}

function severityOfRun(
  input: CharacterRuleInput,
  rule: InjectionRule,
  run: readonly HiddenCharacter[],
): InjectionSeverity | undefined {
  if (isPayloadRun(rule, run)) return severityParameter(rule, 'payloadSeverity');
  const [only] = run;
  if (run.length !== 1 || !only) return rule.severity;
  if (isLegitimateJoiner(input, only)) return undefined;
  return isWordBreakHint(input, only) ? severityParameter(rule, 'wordBreakHintSeverity') : rule.severity;
}

export function findZeroWidthCharacters(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const byteOrderMark = input.ruleset.codepointSet('byteOrderMark');
  const characters = charactersIn(input, 'zeroWidthCharacters').filter(
    (character) => character.from > 0 || !byteOrderMark.has(character.codePoint),
  );
  return adjacentRuns(characters).flatMap((run) => {
    const severity = severityOfRun(input, rule, run);
    if (severity === undefined) return [];
    return [{ ruleId: RULE_ID, ...spanOf(run), severity, messageArguments: { count: run.length } }];
  });
}
