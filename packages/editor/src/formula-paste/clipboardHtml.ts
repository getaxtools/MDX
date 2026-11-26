import { formulaOfMath, isDisplayMath } from './mathFormulas';
import {
  NO_FORMULAS,
  REFUSED,
  type ClipboardFormulas,
  type FoundFormula,
  type PastedBreak,
  type PastePiece,
} from './pastePieces';

export const MAX_CLIPBOARD_MARKUP_BYTES = 1_048_576;
export const MAX_CLIPBOARD_ELEMENTS = 20_000;
export const MAX_CLIPBOARD_DEPTH = 64;

const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

/** Elements read for nothing: scripts, styles, pictures and other embedded content. */
const SKIPPED_ELEMENTS = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'head',
  'title',
  'img',
  'picture',
  'svg',
  'video',
  'audio',
  'iframe',
  'object',
  'embed',
  'canvas',
  'button',
  'input',
  'select',
  'textarea',
]);

const PARAGRAPH_ELEMENTS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'table',
  'ul',
  'ol',
  'dl',
  'figure',
  'hr',
]);

const LINE_ELEMENTS = new Set([
  'div',
  'li',
  'tr',
  'dt',
  'dd',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'aside',
  'address',
  'figcaption',
  'caption',
]);

const CELL_ELEMENTS = new Set(['td', 'th']);

/** Clipboard markup over the byte limit is pasted as text without being parsed. */
export function isMarkupTooLarge(markup: string): boolean {
  if (markup.length > MAX_CLIPBOARD_MARKUP_BYTES) return true;
  return new TextEncoder().encode(markup).byteLength > MAX_CLIPBOARD_MARKUP_BYTES;
}

/** Whether a tree has more elements or deeper nesting than paste conversion reads. */
export function exceedsElementLimits(root: Element): boolean {
  let count = 0;
  const stack: { readonly element: Element; readonly depth: number }[] = [{ element: root, depth: 1 }];
  for (let next = stack.pop(); next; next = stack.pop()) {
    count += 1;
    if (count > MAX_CLIPBOARD_ELEMENTS || next.depth > MAX_CLIPBOARD_DEPTH) return true;
    for (const child of next.element.children) stack.push({ element: child, depth: next.depth + 1 });
  }
  return false;
}

/**
 * Parses clipboard HTML into a document that runs no script and loads nothing, as parsed documents
 * have no browsing context.
 */
export function inertHtmlDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isMath(element: Element): boolean {
  return (
    element.localName === 'math' && (element.namespaceURI === MATHML_NAMESPACE || element.prefix === null)
  );
}

/** The break around a block element: a blank line around a paragraph, a line break around other blocks. */
function blockBreakOf(name: string): PastedBreak | undefined {
  if (PARAGRAPH_ELEMENTS.has(name)) return { kind: 'break', isBlank: true };
  return LINE_ELEMENTS.has(name) ? { kind: 'break', isBlank: false } : undefined;
}

/** Collects text and formulas in reading order, reading only text and attribute values. */
class PieceCollector {
  readonly pieces: PastePiece[] = [];
  hasFormula = false;
  isMalformed = false;

  collect(node: Node, isPreformatted: boolean): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      this.pieces.push(isPreformatted ? text : text.replaceAll(/[ \t\n\r\f]+/g, ' '));
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) this.collectElement(node as Element, isPreformatted);
  }

  private collectElement(element: Element, isPreformatted: boolean): void {
    const name = element.localName;
    if (SKIPPED_ELEMENTS.has(name) || element.getAttribute('aria-hidden') === 'true') return;
    if (isMath(element)) {
      this.collectFormula(element);
      return;
    }
    if (name === 'br') {
      this.pieces.push({ kind: 'break', isBlank: false });
      return;
    }
    const lineBreak = blockBreakOf(name);
    if (lineBreak) this.pieces.push(lineBreak);
    for (const child of element.childNodes) this.collect(child, isPreformatted || name === 'pre');
    if (CELL_ELEMENTS.has(name)) this.pieces.push('	');
    if (lineBreak) this.pieces.push(lineBreak);
  }

  private collectFormula(math: Element): void {
    const formula: FoundFormula | undefined = formulaOfMath(math);
    if (!formula) {
      this.isMalformed = true;
      return;
    }
    this.hasFormula = true;
    const isDisplay = isDisplayMath(math);
    if (isDisplay) this.pieces.push({ kind: 'break', isBlank: true });
    this.pieces.push(formula);
    if (isDisplay) this.pieces.push({ kind: 'break', isBlank: true });
  }
}

/** The text and formulas of clipboard HTML, read within the size, element and depth limits. */
export function readHtmlFormulas(html: string): ClipboardFormulas {
  if (isMarkupTooLarge(html)) return REFUSED;
  const { body } = inertHtmlDocument(html);
  if (exceedsElementLimits(body)) return REFUSED;
  const collector = new PieceCollector();
  collector.collect(body, false);
  if (collector.isMalformed) return REFUSED;
  if (!collector.hasFormula) return NO_FORMULAS;
  // Breaks at both ends drop the spaces that HTML text starts and ends with.
  const edge = { kind: 'break', isBlank: false } as const;
  return { kind: 'formulas', pieces: [edge, ...collector.pieces, edge] };
}
