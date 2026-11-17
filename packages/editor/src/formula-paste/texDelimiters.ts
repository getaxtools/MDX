import { markdownSyntax } from '../syntax/markdownSyntax';
import { texFormula, type PastePiece } from './pastePieces';

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
const DELIMITER_LENGTH = 2;

interface TextRange {
  readonly from: number;
  readonly to: number;
}

function codeRangesOf(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  markdownSyntax()
    .language.parser.parse(text)
    .iterate({
      enter: (node) => {
        if (!CODE_NODES.has(node.name)) return true;
        ranges.push({ from: node.from, to: node.to });
        return false;
      },
    });
  return ranges;
}

/** A backslash after an odd number of backslashes is itself escaped, as in TeX's `\\(`. */
function isEscaped(text: string, backslashAt: number): boolean {
  let count = 0;
  while (backslashAt - count - 1 >= 0 && text[backslashAt - count - 1] === '\\') count += 1;
  return count % 2 === 1;
}

function delimiterAt(text: string, from: number, delimiter: string): number {
  let index = text.indexOf(delimiter, from);
  while (index !== -1 && isEscaped(text, index)) index = text.indexOf(delimiter, index + 1);
  return index;
}

interface DelimitedFormula {
  readonly from: number;
  readonly to: number;
  readonly tex: string;
  readonly isDisplay: boolean;
}

function formulaFrom(text: string, openerAt: number): DelimitedFormula | undefined {
  const isDisplay = text[openerAt + 1] === '[';
  const closerAt = delimiterAt(text, openerAt + DELIMITER_LENGTH, isDisplay ? '\\]' : '\\)');
  if (closerAt === -1) return undefined;
  const tex = text.slice(openerAt + DELIMITER_LENGTH, closerAt);
  const isOneParagraph = !/\n[ \t]*\n/.test(tex);
  if (tex.trim() === '' || !isOneParagraph) return undefined;
  return { from: openerAt, to: closerAt + DELIMITER_LENGTH, tex: tex.trim(), isDisplay };
}

/**
 * Plain text with formulas between `\(` and `\)` or `\[` and `\]`, as chat assistants copy them,
 * split into text and formulas; undefined when there is none outside code.
 */
export function texDelimitedPieces(text: string): PastePiece[] | undefined {
  if (!text.includes('\\(') && !text.includes('\\[')) return undefined;
  const codeRanges = codeRangesOf(text);
  const isInCode = (position: number) =>
    codeRanges.some((range) => position >= range.from && position < range.to);
  const pieces: PastePiece[] = [];
  let textStart = 0;
  for (const opener of text.matchAll(/\\[([]/g)) {
    if (opener.index < textStart || isEscaped(text, opener.index) || isInCode(opener.index)) continue;
    const formula = formulaFrom(text, opener.index);
    if (!formula) continue;
    pieces.push(text.slice(textStart, formula.from), texFormula(formula.tex, formula.isDisplay));
    textStart = formula.to;
  }
  if (textStart === 0) return undefined;
  pieces.push(text.slice(textStart));
  return pieces.filter((piece) => piece !== '');
}
