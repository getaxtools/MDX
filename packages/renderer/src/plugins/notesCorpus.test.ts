import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';

const CORPUS_FOLDER = join(import.meta.dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'notes-corpus');

interface ExpectedCorpus {
  readonly headings: readonly { readonly level: number; readonly text: string }[];
  readonly linkTargets: readonly string[];
  readonly tags: readonly string[];
}

describe('the notes corpus', () => {
  it('renderer and indexer agree on the fixture corpus', () => {
    const corpus = readFileSync(join(CORPUS_FOLDER, 'corpus.md'), 'utf8');
    const expected = JSON.parse(readFileSync(join(CORPUS_FOLDER, 'expected.json'), 'utf8')) as ExpectedCorpus;
    const linkTargets: string[] = [];
    const renderer = createMarkdownRenderer({
      window,
      notes: {
        resolveWikiLink: (target) => {
          linkTargets.push(target);
          return undefined;
        },
        unresolvedDescription: 'no note yet',
      },
    });

    const rendered = renderer.render(corpus);
    const page = new DOMParser().parseFromString(rendered.html, 'text/html');
    const tags = [...page.querySelectorAll('.tag')].map((tag) => tag.textContent.slice(1));

    expect(rendered.outline.map(({ level, text }) => ({ level, text }))).toEqual(expected.headings);
    expect(linkTargets).toEqual(expected.linkTargets);
    expect([...new Set(tags)]).toEqual(expected.tags);
  });
});
