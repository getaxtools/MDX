import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

export const MATH_INLINE_CLASS = 'mdx-math-inline';
export const MATH_DISPLAY_CLASS = 'mdx-math-display';

const DOLLAR = '$';
const DISPLAY_DELIMITER = '$$';
const WHITESPACE = /\s/;
const DIGIT = /\d/;
const CODE_BLOCK_INDENT = 4;

type BlockRuleArguments = [state: StateBlock, startLine: number, endLine: number, silent: boolean];

interface LineRange {
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Turns `$…$` and `$$…$$` into placeholders that the rich block renderer fills with KaTeX later,
 * so math costs nothing until a document actually contains some.
 */
export function mathPlugin(markdown: MarkdownIt): void {
  markdown.inline.ruler.before('escape', 'mdx_math_inline', readInlineMath);
  markdown.block.ruler.before(
    'fence',
    'mdx_math_block',
    (...[state, startLine, endLine, silent]: BlockRuleArguments) =>
      readBlockMath(state, { startLine, endLine }, silent),
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
  const escape = markdown.utils.escapeHtml;
  markdown.renderer.rules.mdx_math_inline = (tokens, index) => {
    const token = tokens[index];
    const className = token?.markup === DISPLAY_DELIMITER ? MATH_DISPLAY_CLASS : MATH_INLINE_CLASS;
    return `<span class="${className}">${escape(token?.content ?? '')}</span>`;
  };
  markdown.renderer.rules.mdx_math_block = (tokens, index) =>
    `<div class="${MATH_DISPLAY_CLASS}">${escape(tokens[index]?.content ?? '')}</div>\n`;
}

function readInlineMath(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== DOLLAR) return false;
  const isDisplay = state.src.startsWith(DISPLAY_DELIMITER, state.pos);
  const contentStart = state.pos + (isDisplay ? DISPLAY_DELIMITER.length : DOLLAR.length);
  const contentEnd = isDisplay
    ? findClosingDisplayDelimiter(state.src, contentStart)
    : findClosingInlineDelimiter(state.src, contentStart);
  if (contentEnd === -1) return false;
  if (!silent) {
    const token = state.push('mdx_math_inline', 'span', 0);
    token.content = state.src.slice(contentStart, contentEnd).trim();
    token.markup = isDisplay ? DISPLAY_DELIMITER : DOLLAR;
  }
  state.pos = contentEnd + (isDisplay ? DISPLAY_DELIMITER.length : DOLLAR.length);
  return true;
}

/** A single `$` closes only when it hugs the math, so prices such as "$5 and $10" stay text. */
function findClosingInlineDelimiter(source: string, contentStart: number): number {
  const firstCharacter = source[contentStart];
  if (firstCharacter === undefined || WHITESPACE.test(firstCharacter) || firstCharacter === DOLLAR) return -1;
  for (let index = contentStart + 1; index < source.length; index += 1) {
    if (isClosingDollar(source, index)) return index;
  }
  return -1;
}

function isClosingDollar(source: string, index: number): boolean {
  const previous = source[index - 1] ?? ' ';
  const isEscaped = previous === '\\';
  const isBeforeDigit = DIGIT.test(source[index + 1] ?? '');
  return source[index] === DOLLAR && !isEscaped && !WHITESPACE.test(previous) && !isBeforeDigit;
}

function findClosingDisplayDelimiter(source: string, contentStart: number): number {
  const end = source.indexOf(DISPLAY_DELIMITER, contentStart);
  return end > contentStart && source.slice(contentStart, end).trim() !== '' ? end : -1;
}

function readBlockMath(state: StateBlock, lines: LineRange, silent: boolean): boolean {
  const { startLine } = lines;
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= CODE_BLOCK_INDENT) return false;
  if (!lineText(state, startLine).startsWith(DISPLAY_DELIMITER)) return false;
  const closing = findClosingLine(state, lines);
  if (!closing) return false;
  if (!silent) {
    const token = state.push('mdx_math_block', 'div', 0);
    token.block = true;
    token.content = closing.content.trim();
    token.map = [startLine, closing.line + 1];
  }
  state.line = closing.line + 1;
  return true;
}

function findClosingLine(
  state: StateBlock,
  { startLine, endLine }: LineRange,
): { readonly line: number; readonly content: string } | undefined {
  const afterOpening = lineText(state, startLine).slice(DISPLAY_DELIMITER.length);
  if (afterOpening.trimEnd().endsWith(DISPLAY_DELIMITER)) {
    return { line: startLine, content: afterOpening.trimEnd().slice(0, -DISPLAY_DELIMITER.length) };
  }
  const contentLines = [afterOpening];
  for (let line = startLine + 1; line < endLine; line += 1) {
    const text = lineText(state, line);
    if (text.trimEnd().endsWith(DISPLAY_DELIMITER)) {
      contentLines.push(text.trimEnd().slice(0, -DISPLAY_DELIMITER.length));
      return { line, content: contentLines.join('\n') };
    }
    contentLines.push(text);
  }
  return undefined;
}

function lineText(state: StateBlock, line: number): string {
  const start = (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);
  return state.src.slice(start, state.eMarks[line]);
}
