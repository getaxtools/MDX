export interface LineAndColumn {
  /** Zero-based. */
  readonly line: number;
  /** Zero-based, in UTF-16 code units from the start of the line. */
  readonly column: number;
}

const LINE_FEED = '\n';
const CARRIAGE_RETURN = '\r';

/** Maps offsets to lines the way the source editor counts them: CRLF, LF and a lone CR each end a line. */
export class TextPositions {
  private constructor(
    private readonly text: string,
    private readonly lineStarts: readonly number[],
  ) {}

  static of(text: string): TextPositions {
    const lineStarts = [0];
    for (let offset = 0; offset < text.length; offset += 1) {
      const character = text[offset];
      if (character === CARRIAGE_RETURN && text[offset + 1] === LINE_FEED) offset += 1;
      if (character === CARRIAGE_RETURN || character === LINE_FEED) lineStarts.push(offset + 1);
    }
    return new TextPositions(text, lineStarts);
  }

  lineCount(): number {
    return this.lineStarts.length;
  }

  lineOf(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((this.lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  positionOf(offset: number): LineAndColumn {
    const line = this.lineOf(offset);
    return { line, column: offset - this.lineStart(line) };
  }

  lineStart(line: number): number {
    return this.lineStarts[line] ?? this.text.length;
  }

  /** The offset just before the line break that ends the line, or the end of the text. */
  lineEnd(line: number): number {
    const nextLineStart = this.lineStarts[line + 1];
    if (nextLineStart === undefined) return this.text.length;
    const breakLength = this.text.startsWith('\r\n', nextLineStart - 2) ? 2 : 1;
    return nextLineStart - breakLength;
  }
}
