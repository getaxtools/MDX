import { describe, expect, it } from 'vitest';
import { editFrontMatter, type FrontMatterEdit } from './editFrontMatter';

function edited(text: string, edit: FrontMatterEdit): string {
  const result = editFrontMatter(text, edit);
  if (result.outcome !== 'edited') throw new Error(result.reason);
  return result.text;
}

const NOTE =
  '---\ntitle: Plan\nstatus: draft\ntags: [work, q4]\naliases:\n  - Roadmap\n  - Plan 2026\n---\n\n# Plan\n';

describe('editFrontMatter', () => {
  it('replaces a value', () => {
    expect(edited(NOTE, { kind: 'setValue', key: 'status', value: 'done' })).toBe(
      NOTE.replace('status: draft', 'status: done'),
    );
  });

  it('inline lists stay inline', () => {
    expect(edited(NOTE, { kind: 'setList', key: 'tags', values: ['work', 'q1'] })).toBe(
      NOTE.replace('tags: [work, q4]', 'tags: [work, q1]'),
    );
  });

  it('dash lists stay dash lists with their indentation', () => {
    expect(edited(NOTE, { kind: 'setList', key: 'aliases', values: ['Roadmap'] })).toBe(
      NOTE.replace('aliases:\n  - Roadmap\n  - Plan 2026', 'aliases:\n  - Roadmap'),
    );
  });

  it('adds a line before the closing fence', () => {
    expect(edited(NOTE, { kind: 'setValue', key: 'owner', value: 'Ada' })).toBe(
      NOTE.replace('  - Plan 2026\n---', '  - Plan 2026\nowner: Ada\n---'),
    );
  });

  it('CRLF kept', () => {
    const windows = NOTE.replaceAll('\n', '\r\n');

    expect(edited(windows, { kind: 'setValue', key: 'owner', value: 'Ada' })).toBe(
      windows.replace('Plan 2026\r\n---', 'Plan 2026\r\nowner: Ada\r\n---'),
    );
  });

  it('BOM kept before a new block', () => {
    expect(edited('\u{FEFF}# Plan\n', { kind: 'setValue', key: 'status', value: 'draft' })).toBe(
      '\u{FEFF}---\nstatus: draft\n---\n# Plan\n',
    );
  });

  it('BOM kept when a value changes', () => {
    const text = '\u{FEFF}---\r\nstatus: draft\r\n---\r\n';

    expect(edited(text, { kind: 'setValue', key: 'status', value: 'done' })).toBe(
      '\u{FEFF}---\r\nstatus: done\r\n---\r\n',
    );
  });

  it('keeps old Mac line breaks', () => {
    const text = '---\rstatus: draft\rowner: Ana\r---\r# Plan\r';

    expect(edited(text, { kind: 'setValue', key: 'status', value: 'done' })).toBe(
      text.replace('draft', 'done'),
    );
    expect(edited(text, { kind: 'setValue', key: 'due', value: 'Friday' })).toBe(
      text.replace('Ana\r', 'Ana\rdue: Friday\r'),
    );
  });

  it('quotes a value that YAML would misread', () => {
    expect(edited(NOTE, { kind: 'setValue', key: 'status', value: 'on hold: waiting' })).toContain(
      'status: "on hold: waiting"',
    );
  });

  it.each([
    ['double quotes', 'status: "draft"', 'status: "done"'],
    ['single quotes', "status: 'draft'", "status: 'done'"],
    ['a plain value', 'status: draft', 'status: done'],
  ])('keeps %s', (_style, line, expected) => {
    const text = `---\n${line}\n---\n`;

    expect(edited(text, { kind: 'setValue', key: 'status', value: 'done' })).toBe(`---\n${expected}\n---\n`);
  });

  it('escapes quotes in the quoting the value had', () => {
    expect(edited("---\nnote: 'a'\n---\n", { kind: 'setValue', key: 'note', value: "it's" })).toBe(
      "---\nnote: 'it''s'\n---\n",
    );
    expect(edited('---\nnote: "a"\n---\n', { kind: 'setValue', key: 'note', value: 'say "hi" \\o/' })).toBe(
      '---\nnote: "say \\"hi\\" \\\\o/"\n---\n',
    );
  });

  it('keeps a comment after the value', () => {
    expect(
      edited('---\nstatus: draft   # for review\n---\n', { kind: 'setValue', key: 'status', value: 'done' }),
    ).toBe('---\nstatus: done   # for review\n---\n');
  });

  it('fills a property that has no value yet', () => {
    expect(
      edited('---\nstatus:\nowner: Ana\n---\n', { kind: 'setValue', key: 'status', value: 'done' }),
    ).toBe('---\nstatus: done\nowner: Ana\n---\n');
  });

  it('keeps comment lines, blank lines and key order', () => {
    const text = '---\n# Planning\ntitle: Plan\n\nstatus: draft\n# end\n---\nBody\n';

    expect(edited(text, { kind: 'setValue', key: 'status', value: 'done' })).toBe(
      text.replace('status: draft', 'status: done'),
    );
  });

  it('keeps the separator and the untouched items of an inline list', () => {
    const text = `---\ntags: ['work',"q4" ,x]\n---\n`;

    expect(edited(text, { kind: 'setList', key: 'tags', values: ['work', 'q4', 'p', 'r'] })).toBe(
      `---\ntags: ['work',"q4" ,p ,r]\n---\n`,
    );
  });

  it('quotes a list item holding a comma', () => {
    expect(edited(NOTE, { kind: 'setList', key: 'tags', values: ['work', 'a, b'] })).toContain(
      'tags: [work, "a, b"]',
    );
  });

  it('changes only the dash items that changed, keeping their comments', () => {
    const text = '---\naliases:\n  - Roadmap # first\n  # spare\n  - "Plan 2026"\n---\n';

    expect(edited(text, { kind: 'setList', key: 'aliases', values: ['Roadmap', 'Plan 2027'] })).toBe(
      text.replace('"Plan 2026"', '"Plan 2027"'),
    );
  });

  it('adds dash items after the last one with its indentation', () => {
    const text = '---\r\naliases:\r\n    - Roadmap\r\n---\r\n';

    expect(edited(text, { kind: 'setList', key: 'aliases', values: ['Roadmap', 'Plan', 'Q4'] })).toBe(
      '---\r\naliases:\r\n    - Roadmap\r\n    - Plan\r\n    - Q4\r\n---\r\n',
    );
  });

  it('an emptied dash list becomes an empty inline list', () => {
    expect(edited(NOTE, { kind: 'setList', key: 'aliases', values: [] })).toBe(
      NOTE.replace('aliases:\n  - Roadmap\n  - Plan 2026', 'aliases: []'),
    );
  });

  it('Unicode line and space separators are part of a value, not YAML breaks or spaces', () => {
    const text = '---\nnote: "a b"\nname: Ana \n---\n';

    expect(edited(text, { kind: 'setValue', key: 'name', value: 'Bo' })).toBe(
      '---\nnote: "a b"\nname: Bo\n---\n',
    );
  });

  const NON_STRING_PLAIN_VALUES = [
    'null',
    'Null',
    'NULL',
    '~',
    'true',
    'False',
    'TRUE',
    'yes',
    'No',
    'ON',
    'off',
    'y',
    'N',
    '1',
    '-12',
    '+3',
    '017',
    '1_000',
    '1e3',
    '1E-3',
    '0x1F',
    '0o7',
    '0b101',
    '.inf',
    '-.Inf',
    '.NaN',
    '1.10',
    '.5',
    '1.2.3',
    '1:30',
    '2024-01-01',
    '2024-1-1',
    '2024-01-01T10:00:00Z',
    '2024-01-01 10:00:00',
    '<<',
    '=',
  ];

  it.each(NON_STRING_PLAIN_VALUES)('a typed %j stays a string in a plain value', (value) => {
    expect(edited('---\nstatus: draft\n---\n', { kind: 'setValue', key: 'status', value })).toBe(
      `---\nstatus: "${value}"\n---\n`,
    );
  });

  it.each(NON_STRING_PLAIN_VALUES)('a typed %j stays a string in list items', (value) => {
    expect(edited(NOTE, { kind: 'setList', key: 'tags', values: ['work', value] })).toContain(
      `tags: [work, "${value}"]`,
    );
    expect(edited(NOTE, { kind: 'setList', key: 'aliases', values: ['Roadmap', value] })).toContain(
      `aliases:\n  - Roadmap\n  - "${value}"\n`,
    );
  });

  it.each(['3 days', 'v1.2.3', '2024 plan', 'yesterday', 'nullable', 'Größe', 'a\tb'])(
    'a %j that YAML reads as text stays plain',
    (value) => {
      expect(edited('---\nstatus: draft\n---\n', { kind: 'setValue', key: 'status', value })).toBe(
        `---\nstatus: ${value}\n---\n`,
      );
    },
  );

  it('keeps the padding and each separator of an inline list', () => {
    expect(
      edited('---\ntags: [ a, b ]\n---\n', { kind: 'setList', key: 'tags', values: ['a', 'c', 'd'] }),
    ).toBe('---\ntags: [ a, c, d ]\n---\n');
    expect(
      edited('---\ntags: [a,b, c]\n---\n', { kind: 'setList', key: 'tags', values: ['a', 'x', 'c', 'd'] }),
    ).toBe('---\ntags: [a,x, c, d]\n---\n');
    expect(edited('---\ntags: [ a, b ]\n---\n', { kind: 'setList', key: 'tags', values: ['a'] })).toBe(
      '---\ntags: [ a ]\n---\n',
    );
  });

  it('an emptied inline list is written as [] and an empty one takes new items', () => {
    expect(edited('---\ntags: [ a, b ]\n---\n', { kind: 'setList', key: 'tags', values: [] })).toBe(
      '---\ntags: []\n---\n',
    );
    expect(edited('---\ntags: [ ]\n---\n', { kind: 'setList', key: 'tags', values: ['a', 'b'] })).toBe(
      '---\ntags: [a, b]\n---\n',
    );
  });

  it.each(['\u0000', '\u0007', '\u001B', '\u007F', '\u0085', '\u009F', '\uD800', 'a\uDC00b'])(
    'refuses a value holding the control or lone surrogate %j',
    (value) => {
      expect(editFrontMatter(NOTE, { kind: 'setValue', key: 'status', value })).toEqual({
        outcome: 'refused',
        reason: 'invalidValue',
      });
      expect(editFrontMatter(NOTE, { kind: 'setList', key: 'tags', values: ['work', value] })).toEqual({
        outcome: 'refused',
        reason: 'invalidValue',
      });
    },
  );

  it('refuses a value with a line break', () => {
    expect(editFrontMatter(NOTE, { kind: 'setValue', key: 'status', value: 'two\nlines' })).toEqual({
      outcome: 'refused',
      reason: 'invalidValue',
    });
  });

  it.each([
    '---\nsummary: |\n  Long text\n---\n',
    '---\nowner:\n  name: Ada\n---\n',
    '---\nbase: &base x\n---\n',
    '---\nowner: {name: Ada}\n---\n',
    '---\nstatus: draft\nstatus: done\n---\n',
    '---\nnote: "tab\\there"\n---\n',
    '---\nnote: "not closed\n---\n',
    '---\ntags: [a, [b]]\n---\n',
    '---\ntags: [a, ]\n---\n',
    '---\naliases:\n  - a\n    - b\n---\n',
    '---\naliases:\n  - key: value\n---\n',
    '---\nstatus: a: b\n---\n',
    '---\nlong: first\n  continued\n---\n',
  ])('refuses complex front matter %j', (text) => {
    expect(editFrontMatter(text, { kind: 'setValue', key: 'status', value: 'x' })).toEqual({
      outcome: 'refused',
      reason: 'complexFrontMatter',
    });
  });

  it('every untouched byte is unchanged', () => {
    const keys = ['title', 'status', 'tags', 'aliases', 'owner'];
    const values = ['', 'x', 'two words', 'a: b', 'Größe', '#hash', 'quote "this"'];

    for (const key of keys) {
      for (const value of values) {
        const text = edited(NOTE, { kind: 'setValue', key, value });
        const changedLine = text.split('\n').findIndex((line) => line.startsWith(`${key}:`));
        const before = NOTE.split('\n').slice(0, changedLine).join('\n');
        const bodyStart = NOTE.indexOf('\n---\n');

        expect(text.startsWith(before), `${key} ${value}`).toBe(true);
        expect(text.endsWith(NOTE.slice(bodyStart)), `${key} ${value}`).toBe(true);
      }
    }
  });
});
