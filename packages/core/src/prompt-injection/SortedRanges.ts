import type { SourceRange } from './DocumentStructure';

/** Ranges merged where they overlap, for fast "is this offset inside any of them?" questions. */
export class SortedRanges {
  private constructor(private readonly ranges: readonly SourceRange[]) {}

  static of(ranges: readonly SourceRange[]): SortedRanges {
    const sorted = [...ranges].sort((left, right) => left.from - right.from);
    const merged: SourceRange[] = [];
    for (const range of sorted) {
      const previous = merged.at(-1);
      if (previous && range.from <= previous.to)
        merged[merged.length - 1] = { from: previous.from, to: Math.max(previous.to, range.to) };
      else merged.push(range);
    }
    return new SortedRanges(merged);
  }

  contains(offset: number): boolean {
    let low = 0;
    let high = this.ranges.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const range = this.ranges[middle];
      if (!range) return false;
      if (offset < range.from) high = middle - 1;
      else if (offset >= range.to) low = middle + 1;
      else return true;
    }
    return false;
  }
}
