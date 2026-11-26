import type { BlockContext } from './markdownParserTypes';

const QUOTE_MARKERS = /^(?:[ \t]*>[ \t]?)*/;
const HTML_BLOCK_NAMES = [
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul',
];
/** The preview's blocks that end a quote at a line without quote markers: fences, rules, lists, headings, HTML. */
const LINES_THAT_END_A_QUOTE = [
  /^ {0,3}(?:`{3,}|~{3,})/,
  /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/,
  /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/,
  /^ {0,3}#{1,6}(?:[ \t]|$)/,
  /^ {0,3}<(?:(?:script|pre|style|textarea)(?:\s|>|$)|!--|\?|![A-Za-z]|!\[CDATA\[)/i,
  new RegExp(`^ {0,3}</?(?:${HTML_BLOCK_NAMES.join('|')})(?:\\s|/?>|$)`, 'i'),
];

export interface QuoteMarkers {
  readonly count: number;
  /** How many characters of the line the markers and the space after them take. */
  readonly length: number;
}

/** How many quotes hold the block being parsed. */
export function enclosingQuoteCount(context: BlockContext): number {
  let count = 0;
  for (let depth = 0; depth < context.depth; depth += 1) {
    if (context.parentType(depth).name === 'Blockquote') count += 1;
  }
  return count;
}

export function quoteMarkersOf(lineText: string): QuoteMarkers {
  const markers = QUOTE_MARKERS.exec(lineText)?.[0] ?? '';
  return { count: markers.split('>').length - 1, length: markers.length };
}

/**
 * A line without the quote's markers still belongs to the quote, as in the preview, unless it is
 * blank, follows an empty quote line or starts a block of its own.
 */
export function continuesQuoteLazily(content: string, isAfterEmptyQuoteLine: boolean): boolean {
  if (isAfterEmptyQuoteLine || content.trim() === '') return false;
  return !LINES_THAT_END_A_QUOTE.some((pattern) => pattern.test(content));
}
