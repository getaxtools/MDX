import type { MarkdownIt, StateCore, Token } from 'markdown-it';

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export const ALERT_KINDS: readonly AlertKind[] = ['note', 'tip', 'important', 'warning', 'caution'];

export type AlertTitles = Readonly<Record<AlertKind, string>>;

export const ENGLISH_ALERT_TITLES: AlertTitles = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/** A paragraph is an open token, an inline token and a close token. */
const PARAGRAPH_TOKEN_COUNT = 3;

const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*$/i;

/** GitHub alerts: a quote whose first line is `[!NOTE]`, `[!TIP]` and so on becomes a titled callout. */
export function alertsPlugin(markdown: MarkdownIt, titles: AlertTitles = ENGLISH_ALERT_TITLES): void {
  markdown.core.ruler.after('inline', 'mdx_alerts', (state) => {
    for (let index = state.tokens.length - 1; index >= 0; index -= 1) {
      const kind = alertKindAt(state.tokens, index);
      if (kind) convertToAlert(state, index, { kind, title: titles[kind] });
    }
  });
}

function alertKindAt(tokens: readonly Token[], index: number): AlertKind | undefined {
  const isQuoteParagraphStart =
    tokens[index]?.type === 'blockquote_open' && tokens[index + 1]?.type === 'paragraph_open';
  const markerLine = isQuoteParagraphStart ? firstLineOf(tokens[index + 2]) : undefined;
  const marker = markerLine === undefined ? undefined : ALERT_MARKER.exec(markerLine)?.[1];
  return marker ? (marker.toLowerCase() as AlertKind) : undefined;
}

/** The text of an inline token's first line, when that line is plain text. */
function firstLineOf(inline: Token | undefined): string | undefined {
  const [firstChild, nextChild] = inline?.children ?? [];
  if (firstChild?.type !== 'text') return undefined;
  return nextChild === undefined || nextChild.type === 'softbreak' ? firstChild.content : undefined;
}

function convertToAlert(
  state: StateCore,
  quoteIndex: number,
  alert: { readonly kind: AlertKind; readonly title: string },
): void {
  const tokens = state.tokens;
  const quote = tokens[quoteIndex];
  const inline = tokens[quoteIndex + 2];
  const closeIndex = matchingCloseIndex(tokens, quoteIndex);
  const close = tokens[closeIndex];
  if (!quote || !inline || !close) return;
  quote.tag = 'div';
  close.tag = 'div';
  quote.attrSet('class', `markdown-alert markdown-alert-${alert.kind}`);
  removeMarker(inline);
  const isParagraphEmpty = (inline.children ?? []).length === 0;
  tokens.splice(
    quoteIndex + 1,
    isParagraphEmpty ? PARAGRAPH_TOKEN_COUNT : 0,
    ...titleTokens(state, alert.title, quote.level + 1),
  );
}

function matchingCloseIndex(tokens: readonly Token[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const type = tokens[index]?.type;
    if (type === 'blockquote_open') depth += 1;
    if (type === 'blockquote_close') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function removeMarker(inline: Token): void {
  const children = inline.children ?? [];
  const markerLength = children[1]?.type === 'softbreak' ? 2 : 1;
  inline.children = children.slice(markerLength);
  inline.content = inline.content.replace(/^[^\n]*\n?/, '');
}

function titleTokens(state: StateCore, title: string, level: number): Token[] {
  const open = new state.Token('paragraph_open', 'p', 1);
  open.attrSet('class', 'markdown-alert-title');
  open.block = true;
  open.level = level;
  const text = new state.Token('text', '', 0);
  text.content = title;
  const inline = new state.Token('inline', '', 0);
  inline.content = title;
  inline.children = [text];
  inline.level = level + 1;
  const close = new state.Token('paragraph_close', 'p', -1);
  close.block = true;
  close.level = level;
  return [open, inline, close];
}
