import type { LineEnding } from '@mdx/platform';

const ANY_LINE_BREAK = /\r\n|\r|\n/g;
const WINDOWS_LINE_BREAK = /\r\n/g;

/** Text with every line break as `\n`, the way the editor holds it. */
export function withUnixLineBreaks(text: string): string {
  return text.replace(ANY_LINE_BREAK, '\n');
}

/**
 * Edited text with the line breaks the document had on disk. A document with mixed line breaks gets
 * the kind it used most, since the editor cannot tell which line had which.
 */
export function withDocumentLineBreaks(text: string, lineEnding: LineEnding, originalText: string): string {
  const unixText = withUnixLineBreaks(text);
  return usesWindowsLineBreaks(lineEnding, originalText) ? unixText.replace(/\n/g, '\r\n') : unixText;
}

function usesWindowsLineBreaks(lineEnding: LineEnding, originalText: string): boolean {
  if (lineEnding !== 'mixed') return lineEnding === 'crlf';
  const windowsBreaks = originalText.match(WINDOWS_LINE_BREAK)?.length ?? 0;
  const allBreaks = originalText.match(ANY_LINE_BREAK)?.length ?? 0;
  return windowsBreaks * 2 >= allBreaks;
}
