import type { InjectionFinding } from '@mdx/core';
import type { EditorTextPosition } from '@mdx/editor';

const LINE_FEED = '\n';
const CARRIAGE_RETURN = '\r';

/**
 * Where a finding ends, by line and column, counting CRLF, LF and a lone CR as one line break each,
 * the way the check and the editor count lines.
 */
export function findingEnd(text: string, finding: InjectionFinding): EditorTextPosition {
  let line = finding.line;
  let lineStart = finding.from - finding.column;
  for (let offset = finding.from; offset < finding.to; offset += 1) {
    const character = text[offset];
    if (character === CARRIAGE_RETURN && text[offset + 1] === LINE_FEED) offset += 1;
    if (character === CARRIAGE_RETURN || character === LINE_FEED) {
      line += 1;
      lineStart = offset + 1;
    }
  }
  return { line, column: finding.to - lineStart };
}
