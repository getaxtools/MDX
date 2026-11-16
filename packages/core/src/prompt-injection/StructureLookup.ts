import type { DocumentSegment, DocumentStructure, SourceRange } from './DocumentStructure';
import { SortedRanges } from './SortedRanges';

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
    default:
      return [];
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
