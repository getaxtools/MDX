import { exceedsElementLimits, isMarkupTooLarge, readHtmlFormulas } from './clipboardHtml';
import { formulaOfMath } from './mathFormulas';
import { NO_FORMULAS, REFUSED, type ClipboardFormulas } from './pastePieces';
import { texDelimitedPieces } from './texDelimiters';

/** Math tools, and a word processor set to copy MathML, put a whole `<math>` element in the plain text. */
const MATHML_TEXT =
  /^\s*(?:<\?xml[^>]*\?>\s*)?<(?:[A-Za-z][\w.-]*:)?math[\s>][\s\S]*<\/(?:[A-Za-z][\w.-]*:)?math>\s*$/;

function readMathmlText(text: string): ClipboardFormulas {
  if (isMarkupTooLarge(text)) return REFUSED;
  const document = new DOMParser().parseFromString(text.trim(), 'application/xml');
  const root = document.documentElement;
  const isWellFormed = document.getElementsByTagName('parsererror').length === 0;
  if (!isWellFormed || root.localName !== 'math' || exceedsElementLimits(root)) return REFUSED;
  const formula = formulaOfMath(root);
  return formula ? { kind: 'formulas', pieces: [formula] } : REFUSED;
}

/**
 * The formulas a clipboard holds, read in a fixed order: TeX delimiters in its plain text, then the
 * formulas of its HTML, then MathML written as its plain text. A word processor's own equation
 * format is not read, so such a formula pastes as the plain text that comes with it.
 */
export function readClipboardFormulas(clipboard: {
  readonly text: string;
  readonly html: string;
}): ClipboardFormulas {
  const delimited = texDelimitedPieces(clipboard.text);
  if (delimited) return { kind: 'formulas', pieces: delimited };
  if (clipboard.html !== '') {
    const html = readHtmlFormulas(clipboard.html);
    if (html.kind !== 'none') return html;
  }
  return MATHML_TEXT.test(clipboard.text) ? readMathmlText(clipboard.text) : NO_FORMULAS;
}
