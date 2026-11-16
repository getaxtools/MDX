const CODE_POINT_NOTATION = /^U\+([0-9A-F]{4,6})$/;
const RANGE_SEPARATOR = '..';
const HEXADECIMAL = 16;
const MAX_CODE_POINT = 0x10ffff;
const MIN_NOTATION_DIGITS = 4;

interface CodePointRange {
  readonly first: number;
  readonly last: number;
}

export class InvalidCodePointNotationError extends Error {
  constructor(readonly notation: string) {
    super(`Invalid code point notation: ${notation}`);
    this.name = 'InvalidCodePointNotationError';
  }
}

/** Reads `U+200B` as 0x200B; undefined when the notation is malformed or out of range. */
export function parseCodePointNotation(notation: string): number | undefined {
  const digits = CODE_POINT_NOTATION.exec(notation)?.[1];
  if (digits === undefined) return undefined;
  const codePoint = Number.parseInt(digits, HEXADECIMAL);
  return codePoint <= MAX_CODE_POINT ? codePoint : undefined;
}

export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(HEXADECIMAL).toUpperCase().padStart(MIN_NOTATION_DIGITS, '0')}`;
}

function parseRange(notation: string): CodePointRange {
  const [firstNotation = '', lastNotation = firstNotation, ...rest] = notation.split(RANGE_SEPARATOR);
  const first = parseCodePointNotation(firstNotation);
  const last = parseCodePointNotation(lastNotation);
  if (first === undefined || last === undefined || last < first || rest.length > 0)
    throw new InvalidCodePointNotationError(notation);
  return { first, last };
}

function mergeOverlapping(ranges: readonly CodePointRange[]): CodePointRange[] {
  const sorted = [...ranges].sort((left, right) => left.first - right.first);
  const merged: CodePointRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.first <= previous.last + 1)
      merged[merged.length - 1] = { first: previous.first, last: Math.max(previous.last, range.last) };
    else merged.push(range);
  }
  return merged;
}

/** An immutable set of code points written as `U+200B` or `U+2060..U+2064` ranges. */
export class CodePointSet {
  private constructor(private readonly ranges: readonly CodePointRange[]) {}

  static fromNotations(notations: readonly string[]): CodePointSet {
    return new CodePointSet(mergeOverlapping(notations.map(parseRange)));
  }

  static union(sets: readonly CodePointSet[]): CodePointSet {
    return new CodePointSet(mergeOverlapping(sets.flatMap((set) => set.ranges)));
  }

  has(codePoint: number): boolean {
    let low = 0;
    let high = this.ranges.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const range = this.ranges[middle];
      if (!range) return false;
      if (codePoint < range.first) high = middle - 1;
      else if (codePoint > range.last) low = middle + 1;
      else return true;
    }
    return false;
  }

  isEmpty(): boolean {
    return this.ranges.length === 0;
  }
}
