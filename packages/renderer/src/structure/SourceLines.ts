/** Line starts of the full document; CRLF, LF and a lone CR each end a line, as markdown-it counts them. */
export class SourceLines {
  private constructor(
    private readonly source: string,
    private readonly lineStarts: readonly number[],
  ) {}

  static of(source: string): SourceLines {
    const lineStarts = [0];
    for (let offset = 0; offset < source.length; offset += 1) {
      const character = source[offset];
      if (character === '\r' && source[offset + 1] === '\n') offset += 1;
      if (character === '\r' || character === '\n') lineStarts.push(offset + 1);
    }
    return new SourceLines(source, lineStarts);
  }

  lineStart(line: number): number {
    return this.lineStarts[line] ?? this.source.length;
  }

  /** The offset just before the line break that ends the line. */
  lineEnd(line: number): number {
    const nextLineStart = this.lineStarts[line + 1];
    if (nextLineStart === undefined) return this.source.length;
    return nextLineStart - (this.source.startsWith('\r\n', nextLineStart - 2) ? 2 : 1);
  }

  lineText(line: number): string {
    return this.source.slice(this.lineStart(line), this.lineEnd(line));
  }

  textBetween(range: { readonly from: number; readonly to: number }): string {
    return this.source.slice(range.from, range.to);
  }

  /** From the start of the first line to the end of the last, end exclusive, as in a token's map. */
  rangeOfLines(startLine: number, endLine: number): { readonly from: number; readonly to: number } {
    return { from: this.lineStart(startLine), to: this.lineEnd(Math.max(startLine, endLine - 1)) };
  }
}
