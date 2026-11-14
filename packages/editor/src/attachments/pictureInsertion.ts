import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

/** The start of the line nearest to a position: a drop low on a line goes before the next line. */
export function nearestLineStart(state: EditorState, position: number): number {
  const line = state.doc.lineAt(position);
  const isCloserToNextLine = position - line.from > line.to - position && line.number < state.doc.lines;
  return isCloserToNextLine ? line.to + 1 : line.from;
}

/** Puts picture links on lines of their own at a line start, with the caret after them. */
export function pictureLinksAt(
  state: EditorState,
  lineStart: number,
  links: readonly string[],
): TransactionSpec {
  const isAtDocumentEnd = lineStart >= state.doc.length && state.doc.length > 0;
  const isLeadingBreakNeeded = isAtDocumentEnd && !state.doc.toString().endsWith('\n');
  const insert = `${isLeadingBreakNeeded ? '\n' : ''}${links.join('\n')}\n`;
  return {
    changes: { from: lineStart, insert },
    selection: EditorSelection.cursor(lineStart + insert.length),
    userEvent: 'input.drop',
    scrollIntoView: true,
  };
}

const HTTP_IMAGE = /^https?:\/\//i;

/**
 * Pasted HTML whose only content is remote pictures becomes Markdown links to them; nothing is
 * fetched, because parsing into an inert document never loads images.
 */
export function remotePictureMarkdown(html: string, parse: (html: string) => Document): string | undefined {
  const document = parse(html);
  const text = document.body.textContent.trim();
  const images = [...document.querySelectorAll('img')].filter((image) =>
    HTTP_IMAGE.test(image.getAttribute('src') ?? ''),
  );
  if (images.length === 0 || text !== '') return undefined;
  return images
    .map((image) => `![${image.getAttribute('alt') ?? ''}](${image.getAttribute('src') ?? ''})`)
    .join('\n');
}
