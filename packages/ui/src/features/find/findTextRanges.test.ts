import { describe, expect, it } from 'vitest';
import { findTextRanges } from './findTextRanges';

function articleWith(html: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = html;
  return article;
}

describe('findTextRanges', () => {
  it('finds every occurrence regardless of case, across elements', () => {
    const article = articleWith('<h1>Install guide</h1><p>To <em>install</em>, run INSTALL.</p>');

    const ranges = findTextRanges(article, 'install');

    expect(ranges.map((range) => range.toString())).toEqual(['Install', 'install', 'INSTALL']);
  });

  it('finds nothing for an empty query or missing text', () => {
    const article = articleWith('<p>Hello</p>');

    expect(findTextRanges(article, '')).toEqual([]);
    expect(findTextRanges(article, 'bye')).toEqual([]);
  });

  it('counts overlapping text only once per match', () => {
    expect(findTextRanges(articleWith('<p>aaaa</p>'), 'aa')).toHaveLength(2);
  });

  it('finds text in scripts such as Telugu', () => {
    const ranges = findTextRanges(articleWith('<p>నమస్తే ప్రపంచం</p>'), 'ప్రపంచం');

    expect(ranges.map((range) => range.toString())).toEqual(['ప్రపంచం']);
  });
});
