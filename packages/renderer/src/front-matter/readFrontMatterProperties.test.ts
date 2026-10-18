import { describe, expect, it } from 'vitest';
import { readFrontMatterProperties } from './readFrontMatterProperties';

describe('readFrontMatterProperties', () => {
  it('reads names with plain and quoted values', () => {
    const properties = readFrontMatterProperties('title: "Release notes"\nauthor: Ada\nversion: 2');

    expect(properties).toEqual([
      { name: 'title', values: ['Release notes'] },
      { name: 'author', values: ['Ada'] },
      { name: 'version', values: ['2'] },
    ]);
  });

  it('reads inline and indented lists', () => {
    const properties = readFrontMatterProperties('tags: [guide, "how-to"]\nreviewers:\n  - Ada\n  - Grace');

    expect(properties).toEqual([
      { name: 'tags', values: ['guide', 'how-to'] },
      { name: 'reviewers', values: ['Ada', 'Grace'] },
    ]);
  });

  it('skips blank lines and comments', () => {
    expect(readFrontMatterProperties('# draft\n\ntitle: Notes\n')).toEqual([
      { name: 'title', values: ['Notes'] },
    ]);
  });

  it('gives up on nested structures so the raw text can be shown', () => {
    expect(readFrontMatterProperties('author:\n  name: Ada\n  role: editor')).toBeUndefined();
    expect(readFrontMatterProperties('just some text')).toBeUndefined();
  });
});
