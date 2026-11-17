import { markdownSyntax } from '../syntax/markdownSyntax';
import { isFormula, type FoundFormula, type PastePiece } from './pastePieces';

const MATH_NODES = new Set(['InlineMath', 'DisplayMath']);

export interface FormulaConversion {
  /** TeX for MathML, or undefined when it cannot be converted. */
  readonly texOfMathml: (mathml: string) => Promise<string | undefined>;
  /** Whether a formula typesets with the preview's options and limits. */
  readonly isTypeset: (tex: string, isDisplay: boolean) => Promise<boolean>;
}

/** A formula's TeX, converted from MathML when needed and checked with the typesetter. */
export async function checkedTex(
  formula: FoundFormula,
  conversion: FormulaConversion,
): Promise<string | undefined> {
  const { source } = formula;
  const tex =
    source.kind === 'tex' ? source.tex.trim() : (await conversion.texOfMathml(source.mathml))?.trim();
  if (!tex) return undefined;
  return (await conversion.isTypeset(tex, formula.isDisplay)) ? tex : undefined;
}

function writtenFormula(tex: string, isDisplay: boolean): string {
  return isDisplay ? `$$\n${tex}\n$$` : `$${tex}$`;
}

/** Writes pieces as Markdown: breaks merged, spaces at line edges dropped, display formulas on lines of their own. */
class MarkdownWriter {
  private text = '';
  private pendingBreak: 'none' | 'line' | 'blank' = 'none';

  write(piece: string): void {
    const text = this.pendingBreak === 'none' ? piece : piece.replace(/^[ \t]+/, '');
    if (text === '') return;
    if (text.startsWith('\n')) this.pendingBreak = 'none';
    this.flushBreak();
    this.text += text;
  }

  /** A break before any text only drops the spaces that start it. */
  writeBreak(isBlank: boolean): void {
    this.pendingBreak = isBlank || this.pendingBreak === 'blank' ? 'blank' : 'line';
  }

  writeFormula(written: string, isDisplay: boolean): void {
    if (isDisplay && !this.text.endsWith('\n')) this.writeBreak(false);
    this.flushBreak();
    this.text += written;
    if (isDisplay) this.writeBreak(false);
  }

  /** A break left at the end is not written, nor are the spaces before it. */
  markdown(): string {
    return this.pendingBreak === 'none' ? this.text : this.text.replace(/[ \t]+$/, '');
  }

  private flushBreak(): void {
    if (this.pendingBreak === 'none') return;
    const lineBreak = this.pendingBreak === 'blank' ? '\n\n' : '\n';
    this.pendingBreak = 'none';
    if (this.text !== '') this.text = this.text.replace(/[ \t]+$/, '') + lineBreak;
  }
}

/** Whether the Markdown's math is exactly the formulas written, so no stray dollar pairs them up wrongly. */
function readsAsWritten(markdown: string, formulas: readonly string[]): boolean {
  const found: string[] = [];
  markdownSyntax()
    .language.parser.parse(markdown)
    .iterate({
      enter: (node) => {
        if (!MATH_NODES.has(node.name)) return true;
        found.push(markdown.slice(node.from, node.to));
        return false;
      },
    });
  return found.length === formulas.length && found.every((text, index) => text === formulas[index]);
}

/**
 * Pasted pieces as Markdown with each formula in dollar math, or undefined when one formula does
 * not convert or typeset, or the dollars would not read back as those formulas.
 */
export async function formulaMarkdown(
  pieces: readonly PastePiece[],
  conversion: FormulaConversion,
): Promise<string | undefined> {
  const formulas = pieces.filter(isFormula);
  const texts = await Promise.all(formulas.map((formula) => checkedTex(formula, conversion)));
  if (texts.some((tex) => tex === undefined)) return undefined;
  const writer = new MarkdownWriter();
  const written: string[] = [];
  let formulaIndex = 0;
  for (const piece of pieces) {
    if (typeof piece === 'string') writer.write(piece);
    else if (piece.kind === 'break') writer.writeBreak(piece.isBlank);
    else {
      const formula = writtenFormula(texts[formulaIndex] ?? '', piece.isDisplay);
      formulaIndex += 1;
      written.push(formula);
      writer.writeFormula(formula, piece.isDisplay);
    }
  }
  const markdown = writer.markdown();
  return readsAsWritten(markdown, written) ? markdown : undefined;
}
