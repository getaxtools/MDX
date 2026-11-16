import type { BlockContext, Line, MarkdownConfig, ParseInput } from './markdownParserTypes';

export interface DocumentLine {
  /** Where the line starts in the document. */
  readonly from: number;
  readonly text: string;
}

const READ_LENGTH = 256;

let inputOfRunningParse: ParseInput | undefined;

/**
 * Math and front matter count only once their closing line exists, as in the preview, but a block
 * parser sees one line at a time. The text of the parse that is running is kept here, for the length
 * of each parsing step, so their parsers can look ahead.
 */
export const READING_AHEAD: MarkdownConfig = {
  wrap: (parse, input) => ({
    get parsedPos() {
      return parse.parsedPos;
    },
    get stoppedAt() {
      return parse.stoppedAt;
    },
    stopAt: (position) => {
      parse.stopAt(position);
    },
    advance: () => {
      const outerInput = inputOfRunningParse;
      inputOfRunningParse = input;
      try {
        return parse.advance();
      } finally {
        inputOfRunningParse = outerInput;
      }
    },
  }),
};

/** The lines after the current one, read only as far as the caller goes. */
export function linesAfter(context: BlockContext, line: Line): Generator<DocumentLine, void, undefined> {
  return linesFrom(context.lineStart + line.text.length + 1);
}

/** The lines from a line start to the end of the document, read only as far as the caller goes. */
export function* linesFrom(lineStart: number): Generator<DocumentLine, void, undefined> {
  const input = inputOfRunningParse;
  if (!input) return;
  for (let from = lineStart; from <= input.length;) {
    const text = lineTextAt(input, from);
    yield { from, text };
    from += text.length + 1;
  }
}

// `read`, not `chunk`: the editor's input reads chunks through one forward-only cursor that the
// block parser shares, so a chunk read ahead would hand the parser the wrong text afterwards.
function lineTextAt(input: ParseInput, lineStart: number): string {
  let text = '';
  for (let position = lineStart; position < input.length; position += READ_LENGTH) {
    const piece = input.read(position, Math.min(position + READ_LENGTH, input.length));
    const lineBreak = piece.indexOf('\n');
    if (lineBreak !== -1) return text + piece.slice(0, lineBreak);
    text += piece;
  }
  return text;
}
