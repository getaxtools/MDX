import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';

const NOTES = new Map([
  ['plan', 'Projects/Plan.md'],
  ['guide', 'Guide.md'],
]);

const renderer = createMarkdownRenderer({
  window,
  notes: {
    resolveWikiLink: (target) => NOTES.get(target.toLowerCase()),
    unresolvedDescription: 'no note yet',
  },
});

function documentOf(source: string): Document {
  return new DOMParser().parseFromString(renderer.render(source).html, 'text/html');
}

describe('wikiLinksPlugin', () => {
  it('links a wiki-link to its note', () => {
    const link = documentOf('See [[Plan]].').querySelector('a.wiki-link');

    expect(link?.getAttribute('href')).toBe('Projects/Plan.md');
    expect(link?.textContent).toBe('Plan');
  });

  it('renders text after the bar and links the heading as the renderer names it', () => {
    const link = documentOf('[[Guide#First Steps|start here]]').querySelector('a.wiki-link');

    expect(link?.textContent).toBe('start here');
    expect(link?.getAttribute('href')).toBe('Guide.md#mdx-first-steps');
  });

  it('code is not linked', () => {
    const page = documentOf('`[[Plan]]` and\n\n```\n[[Plan]] #tag\n```');

    expect(page.querySelector('.wiki-link')).toBeNull();
    expect(page.querySelector('.tag')).toBeNull();
  });

  it('a wiki-link holding markup cannot inject HTML', () => {
    const page = documentOf('[[<img src=x onerror=alert(1)>|<script>alert(1)</script>]]');

    expect(page.querySelector('img, script')).toBeNull();
    expect(page.querySelector('.wiki-link')?.textContent).toContain('<script>');
  });

  it('unresolved links carry the description and are not marked by colour alone', () => {
    const unresolved = documentOf('[[Missing note]]').querySelector('.wiki-link-unresolved');

    expect(unresolved?.tagName).toBe('SPAN');
    expect(unresolved?.textContent).toBe('Missing note (no note yet)');
    expect(unresolved?.getAttribute('title')).toBe('Missing note');
  });

  it('marks tags, but not number-only words or a hash inside a word', () => {
    const page = documentOf('Ideas #writing/drafts and #2026 and C#sharp');

    expect([...page.querySelectorAll('.tag')].map((tag) => tag.textContent)).toEqual(['#writing/drafts']);
  });

  it('leaves documents outside Notes alone', () => {
    const plain = createMarkdownRenderer({ window }).render('[[Plan]] #tag').html;

    expect(plain).toContain('[[Plan]] #tag');
  });
});
