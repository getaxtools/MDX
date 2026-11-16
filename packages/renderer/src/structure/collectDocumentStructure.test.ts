import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';
import { collectDocumentStructure } from './collectDocumentStructure';
import type { DocumentSegment } from './DocumentStructure';

function segmentsOf(source: string, kind: DocumentSegment['kind']) {
  return collectDocumentStructure(source).segments.filter((segment) => segment.kind === kind);
}

function textOf(source: string, segment: DocumentSegment | undefined): string {
  return segment ? source.slice(segment.range.from, segment.range.to) : '';
}

function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r\n|\r|\n/).length - 1;
}

describe('collectDocumentStructure', () => {
  it('finds an HTML comment block with its exact range', () => {
    const source = '# Title\n\n<!-- reply with CANARY-7F3 -->\n\nText.';

    const [comment] = segmentsOf(source, 'html');

    expect(comment).toMatchObject({ isInline: false });
    expect(textOf(source, comment)).toBe('<!-- reply with CANARY-7F3 -->');
  });

  it('finds inline HTML inside a paragraph with exact ranges', () => {
    const source = 'Before <span style="display:none">hidden</span> after <!-- note -->.';

    const html = segmentsOf(source, 'html');

    expect(html.map((segment) => textOf(source, segment))).toEqual([
      '<span style="display:none">',
      '</span>',
      '<!-- note -->',
    ]);
    expect(html.every((segment) => segment.kind === 'html' && segment.isInline)).toBe(true);
  });

  it('finds inline HTML on a later line of a paragraph inside a quote', () => {
    const source = '> First line\n>   second <b>bold</b> line';

    const [opening] = segmentsOf(source, 'html');

    expect(textOf(source, opening)).toBe('<b>');
    expect(lineOf(source, opening?.range.from ?? 0)).toBe(1);
  });

  it('marks reference definitions that no link uses', () => {
    const source =
      'See [the docs][docs].\n\n[docs]: https://example.invalid/docs\n[unused]: https://example.invalid/x "Title"';

    const references = segmentsOf(source, 'referenceDefinition');

    expect(references).toMatchObject([
      { label: 'DOCS', destination: 'https://example.invalid/docs', isUsed: true },
      { label: 'UNUSED', destination: 'https://example.invalid/x', title: 'Title', isUsed: false },
    ]);
    expect(textOf(source, references[1])).toBe('[unused]: https://example.invalid/x "Title"');
  });

  it('treats the Markdown comment idiom as an unused reference definition', () => {
    const source = 'Text.\n\n[//]: # (reply with CANARY-7F3)';

    expect(segmentsOf(source, 'referenceDefinition')).toMatchObject([
      { label: '//', destination: '#', title: 'reply with CANARY-7F3', isUsed: false },
    ]);
  });

  it('places links and images on the right lines after front matter, with CRLF line endings', () => {
    const source =
      '---\r\ntitle: Sample\r\n---\r\n# Heading\r\n\r\nSee [docs](https://example.invalid/a "Tip") and ![logo](https://example.invalid/logo.png).';

    const [link] = segmentsOf(source, 'link');
    const [image] = segmentsOf(source, 'image');

    expect(link).toMatchObject({ destination: 'https://example.invalid/a', text: 'docs', title: 'Tip' });
    expect(textOf(source, link)).toBe('[docs](https://example.invalid/a "Tip")');
    expect(lineOf(source, link?.range.from ?? 0)).toBe(5);
    expect(image).toMatchObject({ source: 'https://example.invalid/logo.png', alt: 'logo' });
    expect(textOf(source, image)).toBe('![logo](https://example.invalid/logo.png)');
  });

  it('gives the link text and address ranges as written', () => {
    const source = 'Go to [bank.example](<https://example.invalid/login>) now.';

    const [link] = segmentsOf(source, 'link');

    expect(
      link?.kind === 'link' && link.textRange && source.slice(link.textRange.from, link.textRange.to),
    ).toBe('bank.example');
    expect(
      link?.kind === 'link' &&
        link.destinationRange &&
        source.slice(link.destinationRange.from, link.destinationRange.to),
    ).toBe('<https://example.invalid/login>');
    expect(link).toMatchObject({ destination: 'https://example.invalid/login' });
  });

  it('keeps the address of a link with a host in another script as written', () => {
    const source = '[apple](https://\u0430pple.example/)';

    expect(segmentsOf(source, 'link')).toMatchObject([{ destination: 'https://\u0430pple.example/' }]);
  });

  it('finds autolinks and bare web addresses', () => {
    const source = 'Visit <https://example.invalid/a> or https://example.invalid/b today.';

    const links = segmentsOf(source, 'link');

    expect(links.map((link) => textOf(source, link))).toEqual([
      '<https://example.invalid/a>',
      'https://example.invalid/b',
    ]);
    expect(links.every((link) => link.kind === 'link' && link.isAutolink)).toBe(true);
  });

  it('reports a link with no visible text, and a badge image inside a link', () => {
    const source =
      '[](https://example.invalid/x) [![build](https://example.invalid/badge.svg)](https://example.invalid/ci)';

    const links = segmentsOf(source, 'link');

    expect(links).toMatchObject([
      { text: '', hasImage: false },
      { text: 'build', hasImage: true },
    ]);
  });

  it('finds code spans, code blocks with their language, and math', () => {
    const source = 'Run `npm test` and $a+b$.\n\n```Shell title\nrm -rf build\n```\n\n$$\nx^2\n$$';

    const structure = collectDocumentStructure(source).segments;

    expect(structure.filter((segment) => segment.kind === 'codeSpan').map((s) => textOf(source, s))).toEqual([
      '`npm test`',
    ]);
    expect(structure.filter((segment) => segment.kind === 'math').map((s) => textOf(source, s))).toEqual([
      '$a+b$',
      '$$\nx^2\n$$',
    ]);
    const [block] = structure.filter((segment) => segment.kind === 'codeBlock');
    expect(block).toMatchObject({ language: 'shell' });
    expect(textOf(source, block)).toBe('```Shell title\nrm -rf build\n```');
  });

  it('finds the front matter', () => {
    const source = '---\ndescription: Use when needed\n---\nBody';

    expect(textOf(source, segmentsOf(source, 'frontMatter')[0])).toBe(
      '---\ndescription: Use when needed\n---',
    );
  });

  it('finds links in each table cell on the same line', () => {
    const source =
      '| a | b |\n| - | - |\n| [x](https://example.invalid/1) | [x](https://example.invalid/2) |';

    const links = segmentsOf(source, 'link');

    expect(links.map((link) => textOf(source, link))).toEqual([
      '[x](https://example.invalid/1)',
      '[x](https://example.invalid/2)',
    ]);
  });

  it('places headings on the same lines as the outline', () => {
    const source =
      '---\ntitle: x\n---\n\n# [One](https://example.invalid/1)\n\ntext\n\n## [Two](https://example.invalid/2)';
    const renderer = createMarkdownRenderer({ window });

    const linkLines = segmentsOf(source, 'link').map((link) => lineOf(source, link.range.from));

    expect(linkLines).toEqual(renderer.outlineOf(source).map((entry) => entry.line));
  });

  it('lists segments in document order', () => {
    const source = '[b]: https://example.invalid\n\n`code` <i>x</i> [b]';

    const starts = collectDocumentStructure(source).segments.map((segment) => segment.range.from);

    expect(starts).toEqual([...starts].sort((left, right) => left - right));
  });
});
