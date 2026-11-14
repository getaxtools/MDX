import { describe, expect, it } from 'vitest';
import { expandSnippet, type SnippetContext } from './expandSnippet';
import {
  availableSnippets,
  BUILT_IN_SNIPPETS,
  deleteSnippet,
  EMPTY_SNIPPET_LIBRARY,
  MAX_SNIPPET_BODY_CHARACTERS,
  parseSnippetLibrary,
  saveSnippet,
  setBuiltInSnippetHidden,
  snippetRefusal,
} from './snippetLibrary';

const CONTEXT: SnippetContext = {
  now: new Date(2026, 10, 12, 9, 5),
  locale: 'en-GB',
  title: 'Guide',
  selection: 'picked',
};

const meeting = { id: 'user.1', name: 'Meeting notes', trigger: 'meet', body: '## Meeting' };

describe('snippet library', () => {
  it('saves, changes and deletes a snippet', () => {
    const saved = saveSnippet(EMPTY_SNIPPET_LIBRARY, meeting);
    const changed = saveSnippet(saved, { ...meeting, body: '## Notes' });

    expect(changed.snippets).toEqual([{ ...meeting, body: '## Notes' }]);
    expect(deleteSnippet(changed, 'user.1').snippets).toEqual([]);
  });

  it('duplicate name ignoring case is refused', () => {
    const library = saveSnippet(EMPTY_SNIPPET_LIBRARY, meeting);

    expect(snippetRefusal(library, { name: 'MEETING NOTES', trigger: '', body: '' })).toBe('nameTaken');
    expect(snippetRefusal(library, { name: 'date', trigger: '', body: '' })).toBe('nameTaken');
  });

  it('10,001 characters is refused', () => {
    const body = 'x'.repeat(MAX_SNIPPET_BODY_CHARACTERS + 1);

    expect(snippetRefusal(EMPTY_SNIPPET_LIBRARY, { name: 'Long', trigger: '', body })).toBe('bodyTooLong');
  });

  it('a snippet needs a name', () => {
    expect(snippetRefusal(EMPTY_SNIPPET_LIBRARY, { name: '  ', trigger: '', body: 'x' })).toBe('nameMissing');
  });

  it('built-ins can be hidden, not deleted or changed', () => {
    const hidden = setBuiltInSnippetHidden(EMPTY_SNIPPET_LIBRARY, 'builtIn.frontMatter', true);

    expect(availableSnippets(hidden).map((snippet) => snippet.id)).not.toContain('builtIn.frontMatter');
    expect(saveSnippet(hidden, { ...BUILT_IN_SNIPPETS[0], body: 'changed' } as typeof meeting)).toBe(hidden);
    expect(availableSnippets(setBuiltInSnippetHidden(hidden, 'builtIn.frontMatter', false))).toHaveLength(
      BUILT_IN_SNIPPETS.length,
    );
  });

  it('a saved state without snippets gives an empty list', () => {
    expect(parseSnippetLibrary(undefined)).toEqual(EMPTY_SNIPPET_LIBRARY);
    expect(
      parseSnippetLibrary({ snippets: [meeting, { id: 2 }], hiddenBuiltInIds: ['builtIn.date', 'x'] }),
    ).toEqual({
      snippets: [meeting],
      hiddenBuiltInIds: ['builtIn.date'],
    });
  });
});

describe('expandSnippet', () => {
  it('date uses the display language format', () => {
    expect(expandSnippet('Written {{date}}', CONTEXT).text).toBe('Written 12/11/2026');
  });

  it('a date can give its own format', () => {
    expect(expandSnippet('{{date:YYYY-MM-DD HH:mm}}', CONTEXT).text).toBe('2026-11-12 09:05');
  });

  it('fills the title and the selection', () => {
    expect(expandSnippet('# {{title}}: {{selection}}', CONTEXT).text).toBe('# Guide: picked');
  });

  it('unknown variables stay as typed', () => {
    expect(expandSnippet('Hi {{name}}', CONTEXT).text).toBe('Hi {{name}}');
  });

  it('dollar signs are not fields', () => {
    expect(expandSnippet('$x$ and ${1:y} cost $5', CONTEXT)).toEqual({
      text: '$x$ and ${1:y} cost $5',
      fields: [],
    });
  });

  it('marks fields in their number order', () => {
    expect(expandSnippet('{{2:owner}} owns {{1:title}}', CONTEXT)).toEqual({
      text: 'owner owns title',
      fields: [
        { number: 1, from: 11, to: 16 },
        { number: 2, from: 0, to: 5 },
      ],
    });
  });

  it('a field placeholder may hold a variable', () => {
    expect(expandSnippet('title: {{1:{{title}}}}', CONTEXT)).toEqual({
      text: 'title: Guide',
      fields: [{ number: 1, from: 7, to: 12 }],
    });
  });

  it('body is inserted character for character', () => {
    const body = 'Line with two trailing spaces  \nCafé * - [ ] \t';

    expect(expandSnippet(body, CONTEXT).text).toBe(body);
  });
});
