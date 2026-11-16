import {
  BYTE_ORDER_MARK,
  linesFrom,
  readFrontMatterLayout,
  type DashItem,
  type EntryValue,
  type FrontMatterEntry,
  type FrontMatterLayout,
  type QuoteStyle,
  type WrittenScalar,
} from './frontMatterLayout';

export type FrontMatterEdit =
  | { readonly kind: 'setValue'; readonly key: string; readonly value: string }
  | { readonly kind: 'setList'; readonly key: string; readonly values: readonly string[] };

export type FrontMatterEditResult =
  | { readonly outcome: 'edited'; readonly text: string }
  | {
      readonly outcome: 'refused';
      readonly reason: 'complexFrontMatter' | 'invalidKey' | 'invalidValue';
    };

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

type ScalarContext = 'block' | 'flow';
type InlineList = Extract<EntryValue, { kind: 'inlineList' }>;

const VALID_KEY = /^[A-Za-z0-9_][\w-]*$/;
/** Line breaks and other control characters, except tab, and halves of a surrogate pair on their own. */
const INVALID_CHARACTER = /(?!\t)\p{Cc}|\p{Cs}/u;
const NEEDS_QUOTES = /^[\s\-?:,[\]{}#&*!|>'"%@`]|:\s|:$|\s#|\s$|^$/;
const NEEDS_QUOTES_IN_FLOW = /[,[\]{}]/;
/**
 * Plain text that YAML 1.2 or YAML 1.1 reads as null, a boolean, a number, a date or a merge key
 * rather than a string. A typed value must stay a string, so it is quoted; these patterns are wider
 * than the specifications, since quoting text that needed none does no harm.
 */
const NON_STRING_PLAIN = [
  /^(?:~|null|true|false|y|yes|n|no|on|off|=|<<)$/i,
  /^[-+]?(?:[0-9][0-9_]*(?::[0-5]?[0-9])*)?(?:\.[0-9_.]*)?(?:[eE][-+]?[0-9]+)?$/,
  /^[-+]?0(?:b[01_]+|o[0-7_]+|x[0-9a-fA-F_]+)$/i,
  /^[-+]?\.(?:inf|nan)$/i,
  /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:$|[Tt \t])/,
];
const DEFAULT_LIST_SEPARATOR = ', ';

/**
 * Changes one property of simple front matter and nothing else: only the bytes of that value (or
 * of the list items that changed) are rewritten, in the quoting they had, and every other byte,
 * comment, byte order mark and line break stays as it is. Front matter it cannot read safely is refused.
 */
export function editFrontMatter(text: string, edit: FrontMatterEdit): FrontMatterEditResult {
  if (!VALID_KEY.test(edit.key)) return { outcome: 'refused', reason: 'invalidKey' };
  const values = edit.kind === 'setValue' ? [edit.value] : edit.values;
  if (values.some((value) => INVALID_CHARACTER.test(value)))
    return { outcome: 'refused', reason: 'invalidValue' };
  const layout = readFrontMatterLayout(text);
  if (layout === 'complex') return { outcome: 'refused', reason: 'complexFrontMatter' };
  if (!layout) return { outcome: 'edited', text: withNewFrontMatter(text, edit) };
  const entry = layout.entries.find((candidate) => candidate.key === edit.key);
  const splices = entry ? splicesFor(entry, edit, layout.lineBreak) : [newEntrySplice(layout, edit)];
  return { outcome: 'edited', text: withSplices(text, splices) };
}

function splicesFor(entry: FrontMatterEntry, edit: FrontMatterEdit, lineBreak: string): Splice[] {
  const { value } = entry;
  if (edit.kind === 'setList' && value.kind === 'dashList' && edit.values.length > 0) {
    return dashListSplices(value.items, edit.values, lineBreak);
  }
  if (value.kind === 'dashList') {
    const end = (value.items.at(-1)?.line ?? entry.keyLine).end;
    return [{ start: entry.keyLine.start, end, text: newEntryText(edit) }];
  }
  if (edit.kind === 'setList' && value.kind === 'inlineList') return inlineListSplices(value, edit.values);
  return [replacedValueSplice(value, edit)];
}

/** A value, an inline list or an empty value replaced as a whole by the edit's value or list. */
function replacedValueSplice(
  value: Exclude<EntryValue, { kind: 'dashList' }>,
  edit: FrontMatterEdit,
): Splice {
  const replacement =
    edit.kind === 'setValue'
      ? rewrittenScalar(edit.value, value.kind === 'scalar' ? value.scalar : undefined)
      : inlineListText(edit.values);
  if (value.kind === 'scalar') return { start: value.scalar.start, end: value.scalar.end, text: replacement };
  if (value.kind === 'inlineList') return { start: value.start, end: value.end, text: replacement };
  const text = `${value.hasSpaceBefore ? '' : ' '}${replacement}${value.hasCommentAfter ? ' ' : ''}`;
  return { start: value.insertAt, end: value.insertAt, text };
}

/** Items keep their place: changed ones get a new value in their own quoting, extra ones are added after the last. */
function dashListSplices(items: readonly DashItem[], values: readonly string[], lineBreak: string): Splice[] {
  const lastItem = items.at(-1);
  if (!lastItem) return [];
  const splices = changedItemSplices(
    items.map((item) => item.scalar),
    values,
    'block',
  );
  const lastStyle = lastItem.scalar.style;
  const addedItems = values
    .slice(items.length)
    .map((value) => `${lineBreak}${lastItem.indentation}- ${formattedScalar(value, lastStyle, 'block')}`);
  if (addedItems.length > 0) {
    splices.push({ start: lastItem.line.end, end: lastItem.line.end, text: addedItems.join('') });
  }
  const lastKept = items[values.length - 1];
  if (lastKept && values.length < items.length) {
    splices.push({ start: lastKept.line.end, end: lastItem.line.end, text: '' });
  }
  return splices;
}

/** Like a dash list, but within the brackets: padding and each separator stay, new items take the last separator. */
function inlineListSplices(list: InlineList, values: readonly string[]): Splice[] {
  const lastItem = list.items.at(-1);
  if (!lastItem || values.length === 0)
    return [{ start: list.start, end: list.end, text: inlineListText(values) }];
  const splices = changedItemSplices(list.items, values, 'flow');
  const separator = list.separators.at(-1) ?? DEFAULT_LIST_SEPARATOR;
  const addedItems = values
    .slice(list.items.length)
    .map((value) => `${separator}${formattedScalar(value, lastItem.style, 'flow')}`);
  if (addedItems.length > 0)
    splices.push({ start: lastItem.end, end: lastItem.end, text: addedItems.join('') });
  const lastKept = list.items[values.length - 1];
  if (lastKept && values.length < list.items.length) {
    splices.push({ start: lastKept.end, end: lastItem.end, text: '' });
  }
  return splices;
}

function changedItemSplices(
  items: readonly WrittenScalar[],
  values: readonly string[],
  context: ScalarContext,
): Splice[] {
  return items.flatMap((item, index) => {
    const value = values[index];
    if (value === undefined || value === item.value) return [];
    return [{ start: item.start, end: item.end, text: formattedScalar(value, item.style, context) }];
  });
}

function inlineListText(values: readonly string[]): string {
  return `[${values.map((value) => formattedScalar(value, 'plain', 'flow')).join(DEFAULT_LIST_SEPARATOR)}]`;
}

function rewrittenScalar(value: string, existing: WrittenScalar | undefined): string {
  if (existing?.value === value) return existing.written;
  return formattedScalar(value, existing?.style ?? 'plain', 'block');
}

function formattedScalar(value: string, style: QuoteStyle, context: ScalarContext): string {
  if (style === 'single') return `'${value.replaceAll("'", "''")}'`;
  if (style === 'double' || needsQuotes(value, context)) return doubleQuoted(value);
  return value;
}

function needsQuotes(value: string, context: ScalarContext): boolean {
  if (NEEDS_QUOTES.test(value) || NON_STRING_PLAIN.some((pattern) => pattern.test(value))) return true;
  return context === 'flow' && NEEDS_QUOTES_IN_FLOW.test(value);
}

function doubleQuoted(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function newEntryText(edit: FrontMatterEdit): string {
  if (edit.kind === 'setValue') return `${edit.key}: ${formattedScalar(edit.value, 'plain', 'block')}`;
  return `${edit.key}: ${inlineListText(edit.values)}`;
}

function newEntrySplice(layout: FrontMatterLayout, edit: FrontMatterEdit): Splice {
  const at = layout.closingFence.start;
  return { start: at, end: at, text: newEntryText(edit) + layout.lineBreak };
}

function withNewFrontMatter(text: string, edit: FrontMatterEdit): string {
  const hasByteOrderMark = text.startsWith(BYTE_ORDER_MARK);
  const body = hasByteOrderMark ? text.slice(BYTE_ORDER_MARK.length) : text;
  const lineBreak = firstLineBreakOf(body);
  const block = ['---', newEntryText(edit), '---', ''].join(lineBreak);
  return (hasByteOrderMark ? BYTE_ORDER_MARK : '') + block + body;
}

function firstLineBreakOf(text: string): string {
  const lines = linesFrom(text);
  const first = lines.next();
  const second = lines.next();
  return first.done === true || second.done === true ? '\n' : text.slice(first.value.end, second.value.start);
}

function withSplices(text: string, splices: readonly Splice[]): string {
  return [...splices]
    .sort((first, second) => second.start - first.start)
    .reduce((edited, splice) => edited.slice(0, splice.start) + splice.text + edited.slice(splice.end), text);
}
