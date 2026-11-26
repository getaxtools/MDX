import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { editFrontMatter, type FrontMatterEdit } from './editFrontMatter';
import { readFrontMatterLayout } from './frontMatterLayout';
import { readEditableFrontMatter, type EditableProperty } from './readEditableFrontMatter';

type Style = 'plain' | 'single' | 'double';
type Shape = 'value' | 'empty' | 'inline' | 'dash';

interface GeneratedEntry {
  readonly key: string;
  readonly shape: Shape;
  readonly values: readonly string[];
  readonly style: Style;
  readonly hasComment: boolean;
  readonly hasCommentLineBefore: boolean;
  readonly afterColon: string;
  readonly listPadding: string;
  readonly listSeparator: string;
  readonly dashIndentation: string;
}

interface GeneratedNote {
  readonly hasByteOrderMark: boolean;
  readonly lineBreaks: readonly string[];
  readonly closingFence: string;
  readonly fenceTrailingSpaces: string;
  readonly entries: readonly GeneratedEntry[];
}

interface Span {
  readonly start: number;
  readonly end: number;
}

interface WrittenNote {
  readonly text: string;
  /** Where each entry's value is: the value, the `[...]` list, or where an empty value would go. */
  readonly valueSpans: ReadonlyMap<string, Span>;
  /** Where each list item's value is. */
  readonly itemSpans: ReadonlyMap<string, readonly Span[]>;
  readonly keyLineStarts: ReadonlyMap<string, number>;
  readonly entryEnds: ReadonlyMap<string, number>;
  readonly closingFenceStart: number;
}

const SAFE_PLAIN = /^[A-Za-z0-9](?:[A-Za-z0-9 ._-]*[A-Za-z0-9])?$/;
const BODY = '# Body\n\nText with --- and key: value lines.\n';
const RISKY_VALUES = [
  'yes',
  'No',
  'null',
  '~',
  'true',
  'off',
  '1e3',
  '0x1F',
  '.inf',
  '1.10',
  '2024-01-01',
  '- x',
  '? x',
  ': x',
  '#x',
  'a #b',
  'a: b',
  '[x]',
  '{x}',
  '&a',
  '*a',
  '!t',
  '|',
  '>',
  '%x',
  '@x',
  '`x`',
  "''",
  '""',
  ' a ',
  'a,b',
  '<<',
];

/**
 * Plain text that YAML reads as something other than a string, transcribed from the YAML 1.2 core
 * schema and the YAML 1.1 types (null, bool, int, float, timestamp, merge, value), independently of
 * the patterns the editor uses.
 */
const YAML_NON_STRING_PLAIN = [
  /^(?:~|null|Null|NULL)$/,
  /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
  /^[-+]?0b[0-1_]+$/,
  /^[-+]?0[0-7_]+$/,
  /^[-+]?(?:0|[1-9][0-9_]*)$/,
  /^[-+]?0x[0-9a-fA-F_]+$/,
  /^[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+$/,
  /^[-+]?[0-9]+$/,
  /^0o[0-7]+$/,
  /^0x[0-9a-fA-F]+$/,
  /^[-+]?(?:[0-9][0-9_]*)?\.[0-9.]*(?:[eE][-+][0-9]+)?$/,
  /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
  /^[-+]?\.(?:inf|Inf|INF)$/,
  /^\.(?:nan|NaN|NAN)$/,
  /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/,
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*Z|[-+][0-9]{1,2}(?::[0-9]{2})?)?$/,
  /^(?:<<|=)$/,
];
/** What a plain scalar may not look like whatever its type: an indicator first, a comment or a mapping inside. */
const PLAIN_SHAPE_PROBLEM = /^$|^[\s\-?:,[\]{}#&*!|>'"%@`]|:\s|:$|\s#|\s$/;

function isStringSafePlain(written: string, context: 'block' | 'flow'): boolean {
  if (PLAIN_SHAPE_PROBLEM.test(written) || YAML_NON_STRING_PLAIN.some((pattern) => pattern.test(written))) {
    return false;
  }
  return context === 'block' || !/[,[\]{}]/.test(written);
}

/** Control characters other than tab, and halves of a surrogate pair on their own, which the edit refuses. */
function hasInvalidCharacter(value: string): boolean {
  return /[\p{Cc}\p{Cs}]/u.test(value.replaceAll('\t', ''));
}

const valueText = fc.oneof(
  fc.stringMatching(SAFE_PLAIN),
  fc.string({ unit: 'grapheme', maxLength: 12 }).filter((value) => !hasInvalidCharacter(value)),
  fc.constantFrom(...RISKY_VALUES),
);

const generatedEntry = (key: string): fc.Arbitrary<GeneratedEntry> =>
  fc
    .record({
      shape: fc.constantFrom<Shape>('value', 'empty', 'inline', 'dash'),
      values: fc.array(valueText, { minLength: 1, maxLength: 4 }),
      style: fc.constantFrom<Style>('plain', 'single', 'double'),
      hasComment: fc.boolean(),
      hasCommentLineBefore: fc.boolean(),
      afterColon: fc.constantFrom(' ', '\t', '  '),
      listPadding: fc.constantFrom('', ' '),
      listSeparator: fc.constantFrom(', ', ',', ' , '),
      dashIndentation: fc.constantFrom('', '  ', '    '),
    })
    .map((entry) => ({ key, ...entry }));

const generatedNote: fc.Arbitrary<GeneratedNote> = fc
  .uniqueArray(fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/), { minLength: 1, maxLength: 5 })
  .chain((keys) =>
    fc.record({
      hasByteOrderMark: fc.boolean(),
      lineBreaks: fc.array(fc.constantFrom('\n', '\r\n', '\r'), { minLength: 1, maxLength: 6 }),
      closingFence: fc.constantFrom('---', '...'),
      fenceTrailingSpaces: fc.constantFrom('', ' ', ' \t'),
      entries: fc.tuple(...keys.map(generatedEntry)),
    }),
  );

function written(value: string, style: Style, context: 'block' | 'flow'): string {
  if (style === 'single') return `'${value.replaceAll("'", "''")}'`;
  if (style === 'plain' && SAFE_PLAIN.test(value) && isStringSafePlain(value, context)) return value;
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

class NoteWriter {
  text: string;
  private lineCount = 0;
  readonly valueSpans = new Map<string, Span>();
  readonly itemSpans = new Map<string, Span[]>();
  readonly keyLineStarts = new Map<string, number>();
  readonly entryEnds = new Map<string, number>();

  constructor(private readonly note: GeneratedNote) {
    this.text = note.hasByteOrderMark ? '\u{FEFF}' : '';
  }

  addLine(line: string): number {
    const start = this.text.length;
    this.text += line + (this.note.lineBreaks[this.lineCount % this.note.lineBreaks.length] ?? '\n');
    this.lineCount += 1;
    return start;
  }

  addEntry(entry: GeneratedEntry): void {
    if (entry.hasCommentLineBefore) this.addLine('# about the next key');
    const comment = entry.hasComment ? '  # note' : '';
    const prefix = `${entry.key}:`;
    if (entry.shape === 'empty') this.addEmpty(entry, prefix);
    else if (entry.shape === 'value') this.addValue(entry, prefix, comment);
    else if (entry.shape === 'inline') this.addInlineList(entry, prefix, comment);
    else this.addDashList(entry, prefix, comment);
  }

  private addEmpty(entry: GeneratedEntry, prefix: string): void {
    const line = entry.hasComment ? `${prefix}${entry.afterColon}# note` : prefix;
    const start = this.addLine(line);
    const insertAt = start + prefix.length + (entry.hasComment ? entry.afterColon.length : 0);
    this.keyLineStarts.set(entry.key, start);
    this.valueSpans.set(entry.key, { start: insertAt, end: insertAt });
    this.entryEnds.set(entry.key, start + line.length);
  }

  private addValue(entry: GeneratedEntry, prefix: string, comment: string): void {
    const value = written(entry.values[0] ?? '', entry.style, 'block');
    const start = this.addLine(`${prefix}${entry.afterColon}${value}${comment}`);
    const valueStart = start + prefix.length + entry.afterColon.length;
    this.keyLineStarts.set(entry.key, start);
    this.valueSpans.set(entry.key, { start: valueStart, end: valueStart + value.length });
    this.entryEnds.set(entry.key, valueStart + value.length + comment.length);
  }

  private addInlineList(entry: GeneratedEntry, prefix: string, comment: string): void {
    const items = entry.values.map((value) => written(value, entry.style, 'flow'));
    const list = `[${entry.listPadding}${items.join(entry.listSeparator)}${entry.listPadding}]`;
    const start = this.addLine(`${prefix}${entry.afterColon}${list}${comment}`);
    const listStart = start + prefix.length + entry.afterColon.length;
    let itemStart = listStart + 1 + entry.listPadding.length;
    const spans = items.map((item) => {
      const span = { start: itemStart, end: itemStart + item.length };
      itemStart = span.end + entry.listSeparator.length;
      return span;
    });
    this.keyLineStarts.set(entry.key, start);
    this.valueSpans.set(entry.key, { start: listStart, end: listStart + list.length });
    this.itemSpans.set(entry.key, spans);
    this.entryEnds.set(entry.key, listStart + list.length + comment.length);
  }

  private addDashList(entry: GeneratedEntry, prefix: string, comment: string): void {
    this.keyLineStarts.set(entry.key, this.addLine(prefix));
    const itemPrefix = `${entry.dashIndentation}- `;
    const spans = entry.values.map((value) => {
      const item = written(value, entry.style, 'block');
      const start = this.addLine(`${itemPrefix}${item}${comment}`) + itemPrefix.length;
      this.entryEnds.set(entry.key, start + item.length + comment.length);
      return { start, end: start + item.length };
    });
    this.itemSpans.set(entry.key, spans);
  }
}

function writtenNote(note: GeneratedNote): WrittenNote {
  const writer = new NoteWriter(note);
  writer.addLine(`---${note.fenceTrailingSpaces}`);
  for (const entry of note.entries) writer.addEntry(entry);
  const closingFenceStart = writer.addLine(`${note.closingFence}${note.fenceTrailingSpaces}`);
  writer.text += BODY;
  return {
    text: writer.text,
    valueSpans: writer.valueSpans,
    itemSpans: writer.itemSpans,
    keyLineStarts: writer.keyLineStarts,
    entryEnds: writer.entryEnds,
    closingFenceStart,
  };
}

function propertiesOf(note: GeneratedNote): EditableProperty[] {
  return note.entries.map((entry) => {
    if (entry.shape === 'empty') return { key: entry.key, kind: 'value', value: '' };
    if (entry.shape === 'value') return { key: entry.key, kind: 'value', value: entry.values[0] ?? '' };
    return { key: entry.key, kind: 'list', values: entry.values };
  });
}

function editedText(text: string, edit: FrontMatterEdit): string {
  const result = editFrontMatter(text, edit);
  if (result.outcome !== 'edited') throw new Error(result.reason);
  return result.text;
}

/** The edited text is the original with one stretch replaced, so every byte outside it is unchanged. */
function expectOnlyChanged(original: string, edited: string, changed: Span): void {
  expect(edited.startsWith(original.slice(0, changed.start))).toBe(true);
  expect(edited.endsWith(original.slice(changed.end))).toBe(true);
  expect(edited.length).toBeGreaterThanOrEqual(original.length - (changed.end - changed.start));
}

/** Every value written without quotes must still be read as the string it was, not as a number or a boolean. */
function expectPlainValuesAreStrings(text: string): void {
  const layout = readFrontMatterLayout(text);
  if (layout === undefined || layout === 'complex') throw new Error('front matter is not simple');
  for (const { value } of layout.entries) {
    if (value.kind === 'scalar' && value.scalar.style === 'plain') {
      expect(isStringSafePlain(value.scalar.written, 'block'), value.scalar.written).toBe(true);
    }
    const inlineItems = value.kind === 'inlineList' ? value.items : [];
    for (const item of inlineItems.filter((candidate) => candidate.style === 'plain')) {
      expect(isStringSafePlain(item.written, 'flow'), item.written).toBe(true);
    }
    const dashItems = value.kind === 'dashList' ? value.items : [];
    for (const { scalar } of dashItems.filter((candidate) => candidate.scalar.style === 'plain')) {
      expect(isStringSafePlain(scalar.written, 'block'), scalar.written).toBe(true);
    }
  }
}

function withChangedProperty(properties: EditableProperty[], changed: EditableProperty): EditableProperty[] {
  return properties.map((property) => (property.key === changed.key ? changed : property));
}

const RUNS = 300;

describe('editFrontMatter properties', () => {
  it('reads back what was written in any quoting, spacing, fences, line breaks and byte order mark', () => {
    fc.assert(
      fc.property(generatedNote, (note) => {
        expect(readEditableFrontMatter(writtenNote(note).text)).toEqual(propertiesOf(note));
      }),
      { numRuns: RUNS },
    );
  });

  it('every untouched byte is unchanged when a value changes, and the value stays a string', () => {
    const valueEntries = generatedNote.filter((note) =>
      note.entries.some((entry) => entry.shape === 'value' || entry.shape === 'empty'),
    );
    fc.assert(
      fc.property(valueEntries, valueText, fc.nat(), (note, value, pick) => {
        const candidates = note.entries.filter((entry) => entry.shape === 'value' || entry.shape === 'empty');
        const entry = candidates[pick % candidates.length];
        if (!entry) return;
        const { text, valueSpans } = writtenNote(note);

        const result = editedText(text, { kind: 'setValue', key: entry.key, value });

        expectOnlyChanged(text, result, valueSpans.get(entry.key) ?? { start: 0, end: 0 });
        expectPlainValuesAreStrings(result);
        expect(readEditableFrontMatter(result)).toEqual(
          withChangedProperty(propertiesOf(note), { key: entry.key, kind: 'value', value }),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('every untouched byte is unchanged when a list changes, and its items stay strings', () => {
    const listEntries = generatedNote.filter((note) =>
      note.entries.some((entry) => entry.shape === 'inline' || entry.shape === 'dash'),
    );
    const newValues = fc.array(valueText, { maxLength: 5 });
    fc.assert(
      fc.property(listEntries, newValues, fc.nat(), (note, values, pick) => {
        const candidates = note.entries.filter((entry) => entry.shape === 'inline' || entry.shape === 'dash');
        const entry = candidates[pick % candidates.length];
        if (!entry) return;
        const { text, valueSpans, keyLineStarts, entryEnds } = writtenNote(note);
        const changed =
          entry.shape === 'inline'
            ? (valueSpans.get(entry.key) ?? { start: 0, end: 0 })
            : { start: keyLineStarts.get(entry.key) ?? 0, end: entryEnds.get(entry.key) ?? 0 };

        const result = editedText(text, { kind: 'setList', key: entry.key, values });

        expectOnlyChanged(text, result, changed);
        expectPlainValuesAreStrings(result);
        expect(readEditableFrontMatter(result)).toEqual(
          withChangedProperty(propertiesOf(note), { key: entry.key, kind: 'list', values }),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('changing one list item rewrites only that item', () => {
    const listEntries = generatedNote.filter((note) =>
      note.entries.some((entry) => entry.shape === 'inline' || entry.shape === 'dash'),
    );
    fc.assert(
      fc.property(listEntries, valueText, fc.nat(), (note, value, pick) => {
        const entry = note.entries.find(
          (candidate) => candidate.shape === 'inline' || candidate.shape === 'dash',
        );
        if (!entry) return;
        const index = pick % entry.values.length;
        const values = entry.values.map((old, at) => (at === index ? value : old));
        const { text, itemSpans } = writtenNote(note);

        const result = editedText(text, { kind: 'setList', key: entry.key, values });

        expectOnlyChanged(text, result, itemSpans.get(entry.key)?.[index] ?? { start: 0, end: 0 });
        expectPlainValuesAreStrings(result);
      }),
      { numRuns: RUNS },
    );
  });

  it('a new property is one line before the closing fence', () => {
    fc.assert(
      fc.property(generatedNote, valueText, (note, value) => {
        const { text, closingFenceStart } = writtenNote(note);

        const result = editedText(text, { kind: 'setValue', key: 'added-key', value });

        expectOnlyChanged(text, result, { start: closingFenceStart, end: closingFenceStart });
        expectPlainValuesAreStrings(result);
        expect(readEditableFrontMatter(result)?.at(-1)).toEqual({ key: 'added-key', kind: 'value', value });
      }),
      { numRuns: RUNS },
    );
  });
});
