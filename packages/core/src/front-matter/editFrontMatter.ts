export type FrontMatterEdit =
  | { readonly kind: 'setValue'; readonly key: string; readonly value: string }
  | { readonly kind: 'setList'; readonly key: string; readonly values: readonly string[] };

export type FrontMatterEditResult =
  | { readonly outcome: 'edited'; readonly text: string }
  | { readonly outcome: 'refused'; readonly reason: 'complexFrontMatter' | 'invalidKey' };

interface Line {
  readonly start: number;
  /** End of the text, before the line break. */
  readonly end: number;
  readonly text: string;
}

interface Entry {
  readonly key: string;
  readonly keyLine: Line;
  /** Dash items under the key, for a list written one item per line. */
  readonly items: readonly Line[];
}

interface FrontMatter {
  /** Where the lines between the fences start: after the opening fence and its line break. */
  readonly contentStart: number;
  readonly closingFence: Line;
  readonly entries: readonly Entry[];
}

const BYTE_ORDER_MARK = '﻿';
const FENCE = /^---[ \t]*$/;
const CLOSING_FENCE = /^(---|\.\.\.)[ \t]*$/;
const KEY_LINE = /^([A-Za-z0-9_][\w-]*):(.*)$/;
const DASH_ITEM = /^(\s+)?- (.*)$/;
const VALID_KEY = /^[A-Za-z0-9_][\w-]*$/;
/** Block scalars, anchors, aliases, tags and flow maps need a real YAML editor; they are left alone. */
const COMPLEX_VALUE = /^\s*[|>&*!{]/;
const NEEDS_QUOTES = /^[\s\-?:,[\]{}#&*!|>'"%@`]|: | #|\s$|^$/;

/**
 * Changes one property of simple front matter and nothing else: every other byte, the byte order
 * mark and the line endings stay as they are. Front matter it cannot read safely is refused.
 */
export function editFrontMatter(text: string, edit: FrontMatterEdit): FrontMatterEditResult {
  if (!VALID_KEY.test(edit.key)) return { outcome: 'refused', reason: 'invalidKey' };
  const lineBreak = text.includes('\r\n') ? '\r\n' : '\n';
  const frontMatter = readFrontMatter(text);
  if (frontMatter === 'complex') return { outcome: 'refused', reason: 'complexFrontMatter' };
  if (!frontMatter) return { outcome: 'edited', text: withNewFrontMatter(text, edit, lineBreak) };
  const entry = frontMatter.entries.find((candidate) => candidate.key === edit.key);
  const replacement = entryText(edit, lineBreak, entry);
  if (!entry) {
    const at = frontMatter.closingFence.start;
    return { outcome: 'edited', text: text.slice(0, at) + replacement + lineBreak + text.slice(at) };
  }
  const end = (entry.items.at(-1) ?? entry.keyLine).end;
  return { outcome: 'edited', text: text.slice(0, entry.keyLine.start) + replacement + text.slice(end) };
}

function readFrontMatter(text: string): FrontMatter | 'complex' | undefined {
  const lines = linesOf(text);
  const first = lines[0];
  if (!first || !FENCE.test(first.text.replace(BYTE_ORDER_MARK, ''))) return undefined;
  const closingIndex = lines.findIndex((line, index) => index > 0 && CLOSING_FENCE.test(line.text));
  const closingFence = lines[closingIndex];
  if (!closingFence) return undefined;
  const entries = entriesOf(lines.slice(1, closingIndex));
  if (entries === 'complex') return 'complex';
  return { contentStart: lines[1]?.start ?? closingFence.start, closingFence, entries };
}

function entriesOf(lines: readonly Line[]): Entry[] | 'complex' {
  const entries: { key: string; keyLine: Line; items: Line[] }[] = [];
  for (const line of lines) {
    if (line.text.trim() === '' || line.text.trimStart().startsWith('#')) continue;
    const keyMatch = KEY_LINE.exec(line.text);
    if (keyMatch) {
      if (COMPLEX_VALUE.test(keyMatch[2] ?? '')) return 'complex';
      entries.push({ key: keyMatch[1] ?? '', keyLine: line, items: [] });
      continue;
    }
    const current = entries.at(-1);
    if (!current || !isListItemOf(current, line)) return 'complex';
    current.items.push(line);
  }
  return entries;
}

/** A dash item belongs to the key above it only when that key has no value of its own. */
function isListItemOf(entry: Entry, line: Line): boolean {
  return DASH_ITEM.test(line.text) && entry.keyLine.text.trimEnd() === `${entry.key}:`;
}

/** A list keeps the style it had: one item per line stays so, and an inline `[a, b]` list stays inline. */
function entryText(edit: FrontMatterEdit, lineBreak: string, existing: Entry | undefined): string {
  if (edit.kind === 'setValue') return `${edit.key}: ${yamlScalar(edit.value)}`;
  const isDashStyle = existing !== undefined && existing.items.length > 0;
  if (!isDashStyle) return `${edit.key}: [${edit.values.map(yamlScalar).join(', ')}]`;
  const indentation = DASH_ITEM.exec(existing.items[0]?.text ?? '')?.[1] ?? '';
  const items = edit.values.map((value) => `${indentation}- ${yamlScalar(value)}`);
  return [`${edit.key}:`, ...items].join(lineBreak);
}

function withNewFrontMatter(text: string, edit: FrontMatterEdit, lineBreak: string): string {
  const hasByteOrderMark = text.startsWith(BYTE_ORDER_MARK);
  const body = hasByteOrderMark ? text.slice(BYTE_ORDER_MARK.length) : text;
  const block = ['---', entryText(edit, lineBreak, undefined), '---', ''].join(lineBreak);
  return (hasByteOrderMark ? BYTE_ORDER_MARK : '') + block + body;
}

function yamlScalar(value: string): string {
  if (!NEEDS_QUOTES.test(value)) return value;
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of text.matchAll(/\r?\n/g)) {
    lines.push({ start, end: match.index, text: text.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  lines.push({ start, end: text.length, text: text.slice(start) });
  return lines;
}
