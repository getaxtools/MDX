import type { SourceRange } from '../DocumentStructure';
import { severityParameter, type Ruleset } from '../Ruleset';
import { isHostIn } from '../urls/readRemoteUrl';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';

const PIPE_TO_SHELL_RULE_ID = 'exfil-pipe-to-shell';
const CONFUSABLE_COMMAND_RULE_ID = 'char-confusable-command';
const URL_HOST = /https?:\/\/([^/\s"'`|)]+)/i;
const IP_ADDRESS = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$|^\[[0-9a-f:]+\]/i;
const TOKEN = /\S+/g;
const LATIN_LETTER = /\p{Script=Latin}/u;
const SHELL_COMMENT = /(?:^|\s)(?:#|::|rem\s)/i;

const compiledPatterns = new WeakMap<Ruleset, readonly RegExp[]>();

function pipeToShellPatternsOf(ruleset: Ruleset): readonly RegExp[] {
  let patterns = compiledPatterns.get(ruleset);
  if (!patterns) {
    patterns = ruleset.list('pipeToShellPatterns').map((pattern) => new RegExp(pattern, 'giu'));
    compiledPatterns.set(ruleset, patterns);
  }
  return patterns;
}

function isRiskyHost(ruleset: Ruleset, command: string): boolean {
  const host = URL_HOST.exec(command)?.[1]?.toLowerCase();
  if (host === undefined) return false;
  return (
    IP_ADDRESS.test(host) ||
    isHostIn(host, [...ruleset.list('urlShorteners'), ...ruleset.list('collectorHosts')])
  );
}

/** Commands that download a script and run it at once; overlapping forms of one command count once. */
export function findPipeToShell(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(PIPE_TO_SHELL_RULE_ID);
  const ranges = pipeToShellPatternsOf(input.ruleset)
    .flatMap((pattern) => [...input.text.matchAll(pattern)])
    .map((match) => ({ from: match.index, to: match.index + match[0].length }))
    .sort((left, right) => left.from - right.from);
  const distinct = ranges.filter((range, index) => index === 0 || range.from >= (ranges[index - 1]?.to ?? 0));
  return distinct.map((range) => {
    const isRisky = isRiskyHost(input.ruleset, input.text.slice(range.from, range.to));
    return {
      ruleId: PIPE_TO_SHELL_RULE_ID,
      ...range,
      severity: isRisky ? severityParameter(rule, 'riskyHostSeverity') : rule.severity,
      context: {
        isHidden: input.hiddenRegions.contains(range.from),
        isInCodeExample: !isRisky && input.lookup.isInCode(range.from),
      },
    };
  });
}

function commandRangesOf(input: DocumentRuleInput): SourceRange[] {
  const shellLanguages = new Set(input.ruleset.list('shellLanguages'));
  return input.structure.segments.flatMap((segment) => {
    if (segment.kind === 'codeSpan') return [segment.range];
    return segment.kind === 'codeBlock' && shellLanguages.has(segment.language) ? [segment.range] : [];
  });
}

/** One token mixing Latin with look-alikes, fullwidth Latin, a non-ASCII dash before an option, or a stray space or quote. */
function isConfusableToken(input: DocumentRuleInput, token: string): boolean {
  const sets = input.ruleset;
  const codePoints = Array.from(token, (character) => character.codePointAt(0) ?? 0);
  const hasLookalike = codePoints.some((codePoint) => sets.codepointSet('latinLookalikes').has(codePoint));
  const hasLatin = LATIN_LETTER.test(token);
  return (
    (hasLookalike && hasLatin) ||
    codePoints.some((codePoint) => sets.codepointSet('fullwidthLatin').has(codePoint)) ||
    (sets.codepointSet('commandDashes').has(codePoints[0] ?? 0) && LATIN_LETTER.test(token.slice(1))) ||
    codePoints.some((codePoint) => sets.codepointSet('curlyQuotes').has(codePoint))
  );
}

interface CommandLine {
  readonly text: string;
  readonly start: number;
}

function confusableTokensOf(input: DocumentRuleInput, line: CommandLine): SourceRange[] {
  return [...line.text.matchAll(TOKEN)]
    .filter((token) => isConfusableToken(input, token[0]))
    .map((token) => ({ from: line.start + token.index, to: line.start + token.index + token[0].length }));
}

/** No-break and other wide spaces between words, which a shell does not treat as a separator. */
function strayCommandSpacesOf(input: DocumentRuleInput, line: CommandLine): SourceRange[] {
  const commandSpaces = input.ruleset.codepointSet('commandSpaces');
  const ranges: SourceRange[] = [];
  for (let index = 1; index < line.text.length; index += 1) {
    if (commandSpaces.has(line.text.charCodeAt(index)))
      ranges.push({ from: line.start + index, to: line.start + index + 1 });
  }
  return ranges;
}

function commandLinesOf(input: DocumentRuleInput, range: SourceRange): CommandLine[] {
  const lines: CommandLine[] = [];
  let start = range.from;
  for (const line of input.text.slice(range.from, range.to).split('\n')) {
    const commentStart = SHELL_COMMENT.exec(line)?.index ?? line.length;
    lines.push({ text: line.slice(0, commentStart), start });
    start += line.length + 1;
  }
  return lines;
}

/** Characters in shell code and code spans that look normal but change what the command does. */
export function findConfusableCommands(input: DocumentRuleInput): RuleMatch[] {
  const severity = input.ruleset.rule(CONFUSABLE_COMMAND_RULE_ID).severity;
  return commandRangesOf(input)
    .flatMap((range) => commandLinesOf(input, range))
    .flatMap((line) => [...confusableTokensOf(input, line), ...strayCommandSpacesOf(input, line)])
    .map((range) => ({ ruleId: CONFUSABLE_COMMAND_RULE_ID, ...range, severity }));
}
