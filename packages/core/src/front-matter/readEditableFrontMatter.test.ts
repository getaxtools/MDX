import { describe, expect, it } from 'vitest';
import { readEditableFrontMatter } from './readEditableFrontMatter';

describe('readEditableFrontMatter', () => {
  it('reads values and lists in both styles, in file order', () => {
    const text =
      "---\r\ntitle: \"Plan: Q4\"\r\nstatus: draft # soon\r\nowner:\r\ntags: [work, 'it''s']\r\naliases:\r\n  - Roadmap\r\n---\r\nBody";

    expect(readEditableFrontMatter(text)).toEqual([
      { key: 'title', kind: 'value', value: 'Plan: Q4' },
      { key: 'status', kind: 'value', value: 'draft' },
      { key: 'owner', kind: 'value', value: '' },
      { key: 'tags', kind: 'list', values: ['work', "it's"] },
      { key: 'aliases', kind: 'list', values: ['Roadmap'] },
    ]);
  });

  it('reads front matter after a byte order mark', () => {
    expect(readEditableFrontMatter('\u{FEFF}---\nstatus: done\n---\n')).toEqual([
      { key: 'status', kind: 'value', value: 'done' },
    ]);
  });

  it('nothing is editable without front matter', () => {
    expect(readEditableFrontMatter('# Plan\n')).toBeUndefined();
    expect(readEditableFrontMatter('---\nstatus: open\n')).toBeUndefined();
    expect(readEditableFrontMatter('+++\nstatus = "open"\n+++\n')).toBeUndefined();
  });

  it('nested maps are not editable', () => {
    expect(readEditableFrontMatter('---\nowner:\n  name: Ada\n---\n')).toBeUndefined();
  });
});
