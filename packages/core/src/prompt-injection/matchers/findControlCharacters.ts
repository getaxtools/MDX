import { numberParameter, severityParameter, type InjectionRule } from '../Ruleset';
import { charactersIn, spanOf, type CharacterRuleInput, type RuleMatch } from './RuleMatch';
import { adjacentRuns, type HiddenCharacter } from './scanHiddenCharacters';

const RULE_ID = 'char-control';
const CONTROL_SEQUENCE_START = '[';
const OPERATING_SYSTEM_COMMAND_START = ']';
const CONTROL_SEQUENCE_BODY = /^[ -?]*[@-~]/;
const OPERATING_SYSTEM_COMMAND_ENDS = new Set(['\u0007', '\u001b', '\r', '\n']);
const BELL = '\u0007';
const STRING_TERMINATOR = '\u001b\\';

function operatingSystemCommandLength(body: string): number {
  let length = 0;
  while (length < body.length && !OPERATING_SYSTEM_COMMAND_ENDS.has(body.charAt(length))) length += 1;
  if (body.charAt(length) === BELL) return length + 1;
  return body.startsWith(STRING_TERMINATOR, length) ? length + STRING_TERMINATOR.length : length;
}

/** The end of an ANSI escape sequence starting at the offset, or undefined when the escape starts none. */
function escapeSequenceEnd(
  input: CharacterRuleInput,
  escape: HiddenCharacter,
  maxLength: number,
): number | undefined {
  const introducer = input.text[escape.to];
  const bodyStart = escape.to + 1;
  const body = input.text.slice(bodyStart, bodyStart + maxLength);
  if (introducer === CONTROL_SEQUENCE_START)
    return bodyStart + (CONTROL_SEQUENCE_BODY.exec(body)?.[0].length ?? 0);
  if (introducer === OPERATING_SYSTEM_COMMAND_START) return bodyStart + operatingSystemCommandLength(body);
  return undefined;
}

function escapeSequenceMatches(input: CharacterRuleInput, rule: InjectionRule): RuleMatch[] {
  const maxLength = numberParameter(rule, 'maxEscapeSequenceLength');
  const severity = severityParameter(rule, 'escapeSequenceSeverity');
  return charactersIn(input, 'escape').flatMap((escape) => {
    const to = escapeSequenceEnd(input, escape, maxLength);
    return to === undefined ? [] : [{ ruleId: RULE_ID, from: escape.from, to, severity }];
  });
}

/** Both lists are in document order, so one sweep drops the controls that belong to a sequence. */
function outsideOf(sequences: readonly RuleMatch[], controls: readonly HiddenCharacter[]): HiddenCharacter[] {
  let sequenceIndex = 0;
  return controls.filter((control) => {
    while ((sequences[sequenceIndex]?.to ?? Infinity) <= control.from) sequenceIndex += 1;
    const sequence = sequences[sequenceIndex];
    return !sequence || control.from < sequence.from;
  });
}

export function findControlCharacters(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const formFeed = input.ruleset.codepointSet('formFeed');
  const escapeSequences = escapeSequenceMatches(input, rule);
  const otherControls = outsideOf(escapeSequences, charactersIn(input, 'controlCharacters'));
  const controlRuns = adjacentRuns(otherControls).map((run) => {
    const isOnlyFormFeeds = run.every((control) => formFeed.has(control.codePoint));
    const severity = isOnlyFormFeeds ? severityParameter(rule, 'formFeedSeverity') : rule.severity;
    return { ruleId: RULE_ID, ...spanOf(run), severity };
  });
  return [...escapeSequences, ...controlRuns].sort((left, right) => left.from - right.from);
}
