import type { DocumentSegment, DocumentStructure, SourceRange } from './DocumentStructure';

class SortedRanges {
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

type RangeKind = 'code' | 'math' | 'address' | 'linkText';

function rangesOf(segment: DocumentSegment): [RangeKind, SourceRange | undefined][] {
  switch (segment.kind) {
    case 'codeSpan':
    case 'codeBlock':
      return [['code', segment.range]];
    case 'math':
      return [['math', segment.range]];
    case 'link':
      return [
        ['address', segment.destinationRange],
        ['linkText', segment.textRange],
      ];
    case 'image':
      return [['address', segment.sourceRange]];
  }
}

/** Answers "is this offset inside code, math or a link address?" quickly, for large documents. */
export class StructureLookup {
  private constructor(private readonly rangesByKind: ReadonlyMap<RangeKind, SortedRanges>) {}

  static of(structure: DocumentStructure): StructureLookup {
    const collected = new Map<RangeKind, SourceRange[]>();
    for (const [kind, range] of structure.segments.flatMap(rangesOf)) {
      if (!range) continue;
      const ranges = collected.get(kind);
      if (ranges) ranges.push(range);
      else collected.set(kind, [range]);
    }
    return new StructureLookup(
      new Map([...collected].map(([kind, ranges]) => [kind, SortedRanges.of(ranges)] as const)),
    );
  }

  isInCode(offset: number): boolean {
    return this.contains('code', offset);
  }

  isInMath(offset: number): boolean {
    return this.contains('math', offset);
  }

  isInAddress(offset: number): boolean {
    return this.contains('address', offset);
  }

  isInLinkText(offset: number): boolean {
    return this.contains('linkText', offset);
  }

  private contains(kind: RangeKind, offset: number): boolean {
    return this.rangesByKind.get(kind)?.contains(offset) ?? false;
  }
}
