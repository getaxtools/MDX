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
    expect(edited('﻿# Plan\n', { kind: 'setValue', key: 'status', value: 'draft' })).toBe(
      '﻿---\nstatus: draft\n---\n# Plan\n',
    );
  });

  it('quotes a value that YAML would misread', () => {
    expect(edited(NOTE, { kind: 'setValue', key: 'status', value: 'on hold: waiting' })).toContain(
      'status: "on hold: waiting"',
    );
  });

  it.each([
    '---\nsummary: |\n  Long text\n---\n',
    '---\nowner:\n  name: Ada\n---\n',
    '---\nbase: &base x\n---\n',
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
