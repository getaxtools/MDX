import type { LineEnding } from '@mdx/platform';

const ANY_LINE_BREAK = /\r\n|\r|\n/g;

interface DocumentLines {
  readonly original: readonly string[];
  readonly edited: readonly string[];
}

/** Text with every line break as `\n`, the way the editor holds it. */
export function withUnixLineBreaks(text: string): string {
  return text.replace(ANY_LINE_BREAK, '\n');
}

/** Edited text with the line breaks the document had on disk. */
export function withDocumentLineBreaks(text: string, lineEnding: LineEnding, originalText: string): string {
  const unixText = withUnixLineBreaks(text);
  if (lineEnding === 'mixed') return withOriginalLineBreaks(unixText, originalText);
  return lineEnding === 'crlf' ? unixText.replace(/\n/g, '\r\n') : unixText;
}

/**
 * The editor holds every break as `\n`, so a mixed document gets its breaks back line by line: lines
 * that kept their place keep their own break, and only inserted or rewritten lines get the most common
 * kind. Unchanged lines are found from both ends, so one edited stretch never moves the others.
 */
function withOriginalLineBreaks(unixText: string, originalText: string): string {
  const originalBreaks = originalText.match(ANY_LINE_BREAK) ?? [];
  const lines = { original: withUnixLineBreaks(originalText).split('\n'), edited: unixText.split('\n') };
  const breakAfterLine = breakFinderFor(lines, originalBreaks);
  return lines.edited
    .map((line, index) => (index === 0 ? line : `${breakAfterLine(index - 1)}${line}`))
    .join('');
}

function breakFinderFor(
  lines: DocumentLines,
  originalBreaks: readonly string[],
): (lineIndex: number) => string {
  const mostCommonBreak = mostCommonBreakOf(originalBreaks);
  const breakAt = (index: number) => originalBreaks[index] ?? mostCommonBreak;
  if (lines.edited.length === lines.original.length) return breakAt;
  const keptAtStart = matchingLineCount(lines, 'start');
  const keptAtEnd = matchingLineCount(lines, 'end', keptAtStart);
  const shift = lines.original.length - lines.edited.length;
  return (lineIndex) => {
    if (lineIndex < keptAtStart) return breakAt(lineIndex);
    if (lineIndex >= lines.edited.length - keptAtEnd) return breakAt(lineIndex + shift);
    return mostCommonBreak;
  };
}

function matchingLineCount(lines: DocumentLines, from: 'start' | 'end', alreadyMatched = 0): number {
  const limit = Math.min(lines.original.length, lines.edited.length) - alreadyMatched;
  let count = 0;
  while (count < limit && lineFrom(lines.original, from, count) === lineFrom(lines.edited, from, count))
    count += 1;
  return count;
}

function lineFrom(lines: readonly string[], from: 'start' | 'end', offset: number): string | undefined {
  return from === 'start' ? lines[offset] : lines[lines.length - 1 - offset];
}

function mostCommonBreakOf(breaks: readonly string[]): string {
  const windowsBreaks = breaks.filter((lineBreak) => lineBreak === '\r\n').length;
  return windowsBreaks * 2 >= breaks.length && windowsBreaks > 0 ? '\r\n' : '\n';
}
