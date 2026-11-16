import type { SourceRange } from '../DocumentStructure';
import { MatchingText } from '../MatchingText';
import { latinLetterMap, Phrasebook, type NegationWords } from '../Phrasebook';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';
import { hiddenCharactersOf } from './scanHiddenCharacters';

/** Text an agent reads that was hidden from the reader: tag characters, selector bytes or encoded data. */
export interface DecodedPayload {
  readonly range: SourceRange;
  readonly decoded: string;
}

const QUOTES = new Set(['"', '\u201C', '\u201D', '\u201E', '\u00AB', '\u00BB']);
const MAX_QUOTE_LOOKBACK = 200;
const WORD = /[\p{L}\p{N}'-]+/gu;
const NEGATION_LOOKAROUND = 60;

function matchingTextOf(input: DocumentRuleInput, text: string): MatchingText {
  return MatchingText.of(text, {
    ignorable: hiddenCharactersOf(input.ruleset),
    latinLetterOf: latinLetterMap(),
  });
}

/** Inside a quotation on the same line: an odd number of quote marks between the line start and the match. */
function isQuoted(text: string, from: number): boolean {
  let quoteCount = 0;
  for (let index = from - 1; index >= Math.max(0, from - MAX_QUOTE_LOOKBACK); index -= 1) {
    const character = text.charAt(index);
    if (character === '\n') break;
    if (QUOTES.has(character)) quoteCount += 1;
  }
  return quoteCount % 2 === 1;
}

function hasNegation(words: readonly string[], negations: readonly string[]): boolean {
  const joined = ` ${words.join(' ')} `;
  return negations.some((negation) => joined.includes(` ${negation} `));
}

/** "never use --no-verify" and "--no-verify is forbidden" both negate the phrase. */
function isNegated(text: string, match: { from: number; to: number }, negations: NegationWords): boolean {
  const before = text.slice(Math.max(0, match.from - NEGATION_LOOKAROUND), match.from).match(WORD) ?? [];
  const after = text.slice(match.to, match.to + NEGATION_LOOKAROUND).match(WORD) ?? [];
  return (
    hasNegation(before.slice(-negations.wordsBefore), negations.before) ||
    hasNegation(after.slice(0, negations.wordsAfter), negations.after)
  );
}

interface PhraseHit {
  readonly ruleId: string;
  readonly from: number;
  readonly to: number;
  readonly isQuoted: boolean;
  readonly isNegated: boolean;
}

function phraseHitsOf(matching: MatchingText, phrasebook: Phrasebook): PhraseHit[] {
  const hits: PhraseHit[] = [];
  for (const { ruleId, pattern } of phrasebook.phrases) {
    for (const match of matching.text.matchAll(pattern)) {
      const range = { from: match.index, to: match.index + match[0].length };
      if (range.to === range.from) continue;
      hits.push({
        ruleId,
        ...range,
        isQuoted: isQuoted(matching.text, range.from),
        isNegated: isNegated(matching.text, range, phrasebook.negations),
      });
    }
  }
  return hits;
}

export function hasInstructionPhrase(input: DocumentRuleInput, text: string): boolean {
  return phraseHitsOf(matchingTextOf(input, text), Phrasebook.english()).length > 0;
}

/** The `instr-*` rules over the whole document, hidden parts included, on the matching text. */
export function findInstructionPhrases(input: DocumentRuleInput): RuleMatch[] {
  const matching = matchingTextOf(input, input.text);
  return phraseHitsOf(matching, Phrasebook.english()).map((hit) => {
    const range = matching.sourceRangeOf(hit.from, hit.to);
    return {
      ruleId: hit.ruleId,
      ...range,
      severity: input.ruleset.rule(hit.ruleId).severity,
      context: {
        isHidden: input.hiddenRegions.contains(range.from),
        isInCodeExample: hit.isQuoted || input.lookup.isInCode(range.from),
        isNegated: hit.isNegated,
      },
    };
  });
}

/** Checks decoded hidden text once, without decoding it again, and reports it at the payload's range. */
export function findInstructionPhrasesInPayloads(
  input: DocumentRuleInput,
  payloads: readonly DecodedPayload[],
): RuleMatch[] {
  return payloads.flatMap((payload) => {
    const hits = phraseHitsOf(matchingTextOf(input, payload.decoded), Phrasebook.english());
    const ruleIds = [...new Set(hits.map((hit) => hit.ruleId))];
    return ruleIds.map((ruleId) => ({
      ruleId,
      ...payload.range,
      severity: input.ruleset.rule(ruleId).severity,
      context: { isHidden: true, isNegated: hits.every((hit) => hit.ruleId !== ruleId || hit.isNegated) },
      decoded: payload.decoded,
    }));
  });
}
