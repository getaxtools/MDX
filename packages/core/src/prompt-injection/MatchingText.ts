import type { CodePointSet } from './CodePointSet';
import { codePointLength } from './codePoints';
import type { SourceRange } from './DocumentStructure';

export interface MatchingTextOptions {
  /** Characters that are dropped: invisible, control and direction characters. */
  readonly ignorable: CodePointSet;
  /** Cyrillic, Greek and other letters that are read as the Latin letter they imitate. */
  readonly latinLetterOf: ReadonlyMap<number, string>;
  readonly range?: SourceRange;
}

const FIRST_NON_ASCII = 0x80;
const WHITESPACE = /^\s$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const EMPHASIS_MARKER = '*';
const UNDERSCORE = '_';
const LINE_FEED = '\n';
const SPACE = ' ';
const INITIAL_OFFSET_CAPACITY = 16;

/**
 * A copy of the text for phrase matching only: invisible characters dropped, NFKC applied, case folded,
 * look-alike letters read as Latin, emphasis markers dropped (`~` is kept: it starts home folder paths) and spaces collapsed (a line break wins over
 * a space). Every character keeps the offset of the source character it came from, so a match maps back
 * to the exact range in the document, which itself is never changed.
 */
export class MatchingText {
  private constructor(
    private readonly source: string,
    readonly text: string,
    private readonly sourceOffsets: Uint32Array,
  ) {}

  static of(source: string, options: MatchingTextOptions): MatchingText {
    const builder = new MatchingTextBuilder(source, options);
    const range = options.range ?? { from: 0, to: source.length };
    let offset = range.from;
    while (offset < range.to) {
      const codePoint = source.codePointAt(offset) ?? 0;
      builder.add(codePoint, offset);
      offset += codePointLength(codePoint);
    }
    return new MatchingText(source, builder.text, builder.offsets());
  }

  /** The source range of matching text from `from` to `to`, end exclusive, covering whole source characters. */
  sourceRangeOf(from: number, to: number): SourceRange {
    const start = this.sourceOffsets[from] ?? this.source.length;
    if (to <= from) return { from: start, to: start };
    const lastOffset = this.sourceOffsets[to - 1] ?? start;
    return { from: start, to: lastOffset + codePointLength(this.source.codePointAt(lastOffset) ?? 0) };
  }
}

class MatchingTextBuilder {
  text = '';
  private offsetCount = 0;
  private sourceOffsets = new Uint32Array(INITIAL_OFFSET_CAPACITY);

  constructor(
    private readonly source: string,
    private readonly options: MatchingTextOptions,
  ) {}

  add(codePoint: number, offset: number): void {
    if (this.options.ignorable.has(codePoint)) return;
    const character = String.fromCodePoint(codePoint);
    if (WHITESPACE.test(character)) this.addSpace(character === LINE_FEED || character === '\r', offset);
    else if (character === EMPHASIS_MARKER || this.isEmphasisUnderscore(character, offset)) return;
    else this.emit(this.foldedOf(codePoint, character), offset);
  }

  offsets(): Uint32Array {
    return this.sourceOffsets.subarray(0, this.offsetCount);
  }

  private foldedOf(codePoint: number, character: string): string {
    if (codePoint < FIRST_NON_ASCII) return character.toLowerCase();
    const lookalike = this.options.latinLetterOf.get(codePoint);
    if (lookalike !== undefined) return lookalike;
    const normalized = character.normalize('NFKC').toLowerCase();
    return Array.from(
      normalized,
      (part) => this.options.latinLetterOf.get(part.codePointAt(0) ?? 0) ?? part,
    ).join('');
  }

  /** An underscore is emphasis when it does not sit inside a word, as in `_ignore_` but not `AWS_SECRET`. */
  private isEmphasisUnderscore(character: string, offset: number): boolean {
    if (character !== UNDERSCORE) return false;
    const before = this.text.at(-1) ?? SPACE;
    const after = this.source.charAt(offset + 1);
    return !LETTER_OR_DIGIT.test(before) || !LETTER_OR_DIGIT.test(after);
  }

  private addSpace(isLineBreak: boolean, offset: number): void {
    const last = this.text.at(-1);
    if (last === LINE_FEED) return;
    if (last === SPACE) {
      if (isLineBreak) this.text = `${this.text.slice(0, -1)}${LINE_FEED}`;
      return;
    }
    this.emit(isLineBreak ? LINE_FEED : SPACE, offset);
  }

  private emit(folded: string, offset: number): void {
    this.text += folded;
    for (let remaining = folded.length; remaining > 0; remaining -= 1) this.pushOffset(offset);
  }

  private pushOffset(offset: number): void {
    if (this.offsetCount === this.sourceOffsets.length) {
      const grown = new Uint32Array(this.sourceOffsets.length * 2);
      grown.set(this.sourceOffsets);
      this.sourceOffsets = grown;
    }
    this.sourceOffsets[this.offsetCount] = offset;
    this.offsetCount += 1;
  }
}
