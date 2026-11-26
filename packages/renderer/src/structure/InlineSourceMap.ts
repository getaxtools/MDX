import type { SourceLines } from './SourceLines';

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

interface MappedLine {
  readonly contentStart: number;
  readonly sourceStart: number;
}

/**
 * Maps offsets in an inline token's content back to the document. The parser builds that content from
 * the token's source lines, without their indentation and quote markers and trimmed at both ends, so each
 * content line is found at the end of its source line, except the last, which may have lost trailing
 * spaces. Several inline tokens can share a line (table cells), so the search starts after the previous one.
 */
export class InlineSourceMap {
  private constructor(private readonly mappedLines: readonly MappedLine[]) {}

  static of(
    { content, firstLine }: { readonly content: string; readonly firstLine: number },
    lines: SourceLines,
    searchFrom: SourcePosition,
  ): InlineSourceMap {
    const contentLines = content.split('\n');
    let contentStart = 0;
    const mappedLines = contentLines.map((contentLine, index) => {
      const line = firstLine + index;
      const isLast = index === contentLines.length - 1;
      const startColumn = line === searchFrom.line ? searchFrom.column : 0;
      const column = columnOf(lines.lineText(line), contentLine, { isLast, startColumn });
      const mapped = { contentStart, sourceStart: lines.lineStart(line) + column };
      contentStart += contentLine.length + 1;
      return mapped;
    });
    return new InlineSourceMap(mappedLines);
  }

  sourceOffsetOf(contentOffset: number): number {
    let mapped = this.mappedLines[0];
    for (const candidate of this.mappedLines) {
      if (candidate.contentStart > contentOffset) break;
      mapped = candidate;
    }
    return (mapped?.sourceStart ?? 0) + contentOffset - (mapped?.contentStart ?? 0);
  }
}

function columnOf(
  sourceLine: string,
  contentLine: string,
  { isLast, startColumn }: { readonly isLast: boolean; readonly startColumn: number },
): number {
  if (!isLast && sourceLine.endsWith(contentLine)) return sourceLine.length - contentLine.length;
  const found = sourceLine.indexOf(contentLine, startColumn);
  if (found >= 0) return found;
  return Math.max(0, sourceLine.length - contentLine.length);
}
