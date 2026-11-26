import { numberParameter } from '../Ruleset';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';

const RULE_ID = 'hidden-off-screen-text';
const PADDING_CHARACTERS = new Set([' ', '\t', '\u{A0}']);
const BLANK_LINE = /^\s*$/;

/** Text after a long run of padding on its line; a code point loop, so no regex can backtrack on huge lines. */
function paddedTextStart(line: string, paddingLength: number): number | undefined {
  let runLength = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (PADDING_CHARACTERS.has(line.charAt(index))) {
      runLength += 1;
      continue;
    }
    if (runLength >= paddingLength) return index;
    runLength = 0;
  }
  return undefined;
}

function pushedRightMatches(input: DocumentRuleInput, paddingLength: number): RuleMatch[] {
  const severity = input.ruleset.rule(RULE_ID).severity;
  const matches: RuleMatch[] = [];
  for (let line = 0; line < input.positions.lineCount(); line += 1) {
    const lineStart = input.positions.lineStart(line);
    if (input.lookup.isInCode(lineStart)) continue;
    const lineEnd = input.positions.lineEnd(line);
    const textStart = paddedTextStart(input.text.slice(lineStart, lineEnd), paddingLength);
    if (textStart !== undefined)
      matches.push({ ruleId: RULE_ID, from: lineStart + textStart, to: lineEnd, severity });
  }
  return matches;
}

function pushedDownMatches(input: DocumentRuleInput, blankLineCount: number): RuleMatch[] {
  const severity = input.ruleset.rule(RULE_ID).severity;
  const matches: RuleMatch[] = [];
  let blankRun = 0;
  for (let line = 0; line < input.positions.lineCount(); line += 1) {
    const lineStart = input.positions.lineStart(line);
    const lineEnd = input.positions.lineEnd(line);
    if (BLANK_LINE.test(input.text.slice(lineStart, lineEnd))) {
      blankRun += 1;
      continue;
    }
    if (blankRun >= blankLineCount && !input.lookup.isInCode(lineStart))
      matches.push({ ruleId: RULE_ID, from: lineStart, to: lineEnd, severity });
    blankRun = 0;
  }
  return matches;
}

/** Text pushed far to the right or far down, out of sight in an editor without word wrap. */
export function findOffScreenText(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  return [
    ...pushedRightMatches(input, numberParameter(rule, 'paddingLength')),
    ...pushedDownMatches(input, numberParameter(rule, 'blankLineCount')),
  ];
}
