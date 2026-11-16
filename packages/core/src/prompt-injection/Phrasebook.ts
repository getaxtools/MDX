import { parseCodePointNotation } from './CodePointSet';
import lookalikeLetterData from './rules/lookalike-letters.json' with { type: 'json' };
import englishPhrasebookData from './rules/phrasebooks/en.json' with { type: 'json' };
import { RulesetError } from './Ruleset';

export interface CompiledPhrase {
  readonly ruleId: string;
  readonly pattern: RegExp;
}

export interface NegationWords {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly wordsBefore: number;
  readonly wordsAfter: number;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function compiledPhrasesOf(phrases: unknown): CompiledPhrase[] {
  if (typeof phrases !== 'object' || phrases === null) throw new RulesetError('invalidList', 'phrases');
  return Object.entries(phrases).flatMap(([ruleId, patterns]) => {
    if (!isStringList(patterns)) throw new RulesetError('invalidList', ruleId);
    return patterns.map((pattern) => ({ ruleId, pattern: new RegExp(pattern, 'gu') }));
  });
}

/** Phrases that steer agents, as regular expressions over the matching text, with the words that negate them. */
export class Phrasebook {
  private static englishPhrasebook: Phrasebook | undefined;

  private constructor(
    readonly language: string,
    readonly phrases: readonly CompiledPhrase[],
    readonly negations: NegationWords,
  ) {}

  static parse(data: typeof englishPhrasebookData): Phrasebook {
    const { negationsBefore, negationsAfter, negationWordsBefore, negationWordsAfter } = data;
    if (!isStringList(negationsBefore) || !isStringList(negationsAfter))
      throw new RulesetError('invalidList', 'negations');
    return new Phrasebook(data.language, compiledPhrasesOf(data.phrases), {
      before: negationsBefore,
      after: negationsAfter,
      wordsBefore: negationWordsBefore,
      wordsAfter: negationWordsAfter,
    });
  }

  static english(): Phrasebook {
    Phrasebook.englishPhrasebook ??= Phrasebook.parse(englishPhrasebookData);
    return Phrasebook.englishPhrasebook;
  }

  ruleIds(): readonly string[] {
    return [...new Set(this.phrases.map((phrase) => phrase.ruleId))];
  }
}

let latinLetters: ReadonlyMap<number, string> | undefined;

/** Look-alike letters from other alphabets, each read as the Latin letter it imitates. */
export function latinLetterMap(): ReadonlyMap<number, string> {
  latinLetters ??= new Map(
    Object.entries(lookalikeLetterData.latinLetterOf).flatMap(([notation, letter]) => {
      const codePoint = parseCodePointNotation(notation);
      return codePoint === undefined ? [] : [[codePoint, letter] as const];
    }),
  );
  return latinLetters;
}
