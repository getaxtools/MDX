import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** The five looks, as GitHub draws its alerts. */
export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export const ALERT_KINDS: readonly AlertKind[] = ['note', 'tip', 'important', 'warning', 'caution'];

/** Callout types that borrow one of the five looks under their own name. */
export type ExtraCalloutType =
  | 'info'
  | 'todo'
  | 'abstract'
  | 'summary'
  | 'success'
  | 'question'
  | 'failure'
  | 'danger'
  | 'bug'
  | 'example'
  | 'quote';

export type CalloutType = AlertKind | ExtraCalloutType;

export const LOOKS_OF_EXTRA_TYPES: Readonly<Record<ExtraCalloutType, AlertKind>> = {
  info: 'note',
  todo: 'note',
  abstract: 'note',
  summary: 'note',
  quote: 'note',
  success: 'tip',
  example: 'important',
  question: 'warning',
  failure: 'caution',
  danger: 'caution',
  bug: 'caution',
};

export const CALLOUT_TYPES: readonly CalloutType[] = [
  ...ALERT_KINDS,
  ...(Object.keys(LOOKS_OF_EXTRA_TYPES) as ExtraCalloutType[]),
];

export type AlertTitles = Readonly<Record<CalloutType, string>>;

export const ENGLISH_ALERT_TITLES: AlertTitles = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
  info: 'Info',
  todo: 'To do',
  abstract: 'Abstract',
  summary: 'Summary',
  success: 'Success',
  question: 'Question',
  failure: 'Failure',
  danger: 'Danger',
  bug: 'Bug',
  example: 'Example',
  quote: 'Quote',
};

/** A paragraph is an open token, an inline token and a close token. */
const PARAGRAPH_TOKEN_COUNT = 3;

/** `[!type]`, then an optional fold marker, then an optional title on the same line. */
const CALLOUT_MARKER = /^\[!([a-z][\w-]*)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/i;

type Fold = 'none' | 'collapsed' | 'expanded';

interface Callout {
  readonly look: AlertKind;
  readonly title: string;
  readonly fold: Fold;
}

/**
 * GitHub alerts and their wider family: a quote whose first line is `[!NOTE]`, `[!danger]` and so
 * on becomes a titled callout; `-` or `+` after the marker makes it foldable, collapsed or open.
 */
export function alertsPlugin(markdown: MarkdownIt, titles: AlertTitles = ENGLISH_ALERT_TITLES): void {
  markdown.core.ruler.after('inline', 'mdx_alerts', (state) => {
    for (let index = state.tokens.length - 1; index >= 0; index -= 1) {
      const callout = calloutAt(state.tokens, index, titles);
      if (callout) convertToCallout(state, index, callout);
    }
  });
}

function calloutAt(tokens: readonly Token[], index: number, titles: AlertTitles): Callout | undefined {
  const isQuoteParagraphStart =
    tokens[index]?.type === 'blockquote_open' && tokens[index + 1]?.type === 'paragraph_open';
  const markerLine = isQuoteParagraphStart ? firstLineOf(tokens[index + 2]) : undefined;
  const match = markerLine === undefined ? undefined : CALLOUT_MARKER.exec(markerLine);
  return match ? calloutOfMarker(match, titles) : undefined;
}

const FOLDS_BY_MARKER: Readonly<Record<string, Fold>> = { '-': 'collapsed', '+': 'expanded' };

function calloutOfMarker(
  [, typeName = '', foldMarker = '', ownTitle = '']: RegExpExecArray,
  titles: AlertTitles,
): Callout {
  const type = typeName.toLowerCase();
  const knownType = CALLOUT_TYPES.find((candidate) => candidate === type);
  return {
    look: knownType ? lookOf(knownType) : 'note',
    title: ownTitle || (knownType ? titles[knownType] : capitalized(typeName)),
    fold: Object.hasOwn(FOLDS_BY_MARKER, foldMarker) ? (FOLDS_BY_MARKER[foldMarker] ?? 'none') : 'none',
  };
}

function lookOf(type: CalloutType): AlertKind {
  return Object.hasOwn(LOOKS_OF_EXTRA_TYPES, type)
    ? LOOKS_OF_EXTRA_TYPES[type as ExtraCalloutType]
    : (type as AlertKind);
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** The text of an inline token's first line, when that line is plain text. */
function firstLineOf(inline: Token | undefined): string | undefined {
  const [firstChild, nextChild] = inline?.children ?? [];
  if (firstChild?.type !== 'text') return undefined;
  return nextChild === undefined || nextChild.type === 'softbreak' ? firstChild.content : undefined;
}

function convertToCallout(state: StateCore, quoteIndex: number, callout: Callout): void {
  const tokens = state.tokens;
  const quote = tokens[quoteIndex];
  const inline = tokens[quoteIndex + 2];
  const closeIndex = matchingCloseIndex(tokens, quoteIndex);
  const close = tokens[closeIndex];
  if (!quote || !inline || !close) return;
  const tag = callout.fold === 'none' ? 'div' : 'details';
  quote.tag = tag;
  close.tag = tag;
  quote.attrSet('class', `markdown-alert markdown-alert-${callout.look}`);
  if (callout.fold === 'expanded') quote.attrSet('open', '');
  removeMarker(inline);
  const isParagraphEmpty = (inline.children ?? []).length === 0;
  tokens.splice(
    quoteIndex + 1,
    isParagraphEmpty ? PARAGRAPH_TOKEN_COUNT : 0,
    ...titleTokens(state, callout, quote.level + 1),
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

/** A foldable callout's title is its `summary`, which the browser makes the expand button. */
function titleTokens(state: StateCore, callout: Callout, level: number): Token[] {
  const tag = callout.fold === 'none' ? 'p' : 'summary';
  const open = new state.Token(tag === 'p' ? 'paragraph_open' : 'callout_summary_open', tag, 1);
  open.attrSet('class', 'markdown-alert-title');
  open.block = true;
  open.level = level;
  const text = new state.Token('text', '', 0);
  text.content = callout.title;
  const inline = new state.Token('inline', '', 0);
  inline.content = callout.title;
  inline.children = [text];
  inline.level = level + 1;
  const close = new state.Token(tag === 'p' ? 'paragraph_close' : 'callout_summary_close', tag, -1);
  close.block = true;
  close.level = level;
  return [open, inline, close];
}
