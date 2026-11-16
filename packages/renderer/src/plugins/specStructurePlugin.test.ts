import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';
import type { SpecStructureRendering } from './specStructurePlugin';

const LABELS = { added: 'Added', modified: 'Modified', removed: 'Removed', renamed: 'Renamed' } as const;
const DELTA: SpecStructureRendering = { kind: 'deltaSpec', sectionLabels: LABELS };
const MAIN: SpecStructureRendering = { kind: 'mainSpec', sectionLabels: LABELS };

const renderer = createMarkdownRenderer({ window });

function render(source: string, specStructure?: SpecStructureRendering) {
  const rendered = renderer.render(source, specStructure ? { specStructure } : {});
  return { page: new DOMParser().parseFromString(rendered.html, 'text/html'), outline: rendered.outline };
}

const DELTA_SOURCE = [
  '# Spec Delta',
  '',
  '## ADDED Requirements',
  '',
  '### Requirement: Pin tabs',
  'The viewer SHALL pin.',
  '',
  '#### Scenario: Pin a tab',
  '- **WHEN** pinned',
  '',
  '## MODIFIED Requirements',
  '',
  '### Requirement: Open tabs',
  'The viewer SHALL open.',
  '',
  '## REMOVED Requirements',
  '',
  '- ### Requirement: Old layout',
  '',
  '## RENAMED Requirements',
  '',
  '- FROM: `### Requirement: A`',
  '- TO: `### Requirement: B`',
].join('\n');

describe('specStructurePlugin', () => {
  it('wraps each delta section in a section named by its visible label', () => {
    const { page } = render(DELTA_SOURCE, DELTA);

    const sections = [...page.querySelectorAll('section.mdx-spec-delta')].map((section) => [
      section.className,
      section.getAttribute('aria-label'),
      section.querySelector('h2 .mdx-spec-label')?.textContent,
    ]);
    expect(sections).toEqual([
      ['mdx-spec-delta mdx-spec-delta-added', 'Added', 'Added'],
      ['mdx-spec-delta mdx-spec-delta-modified', 'Modified', 'Modified'],
      ['mdx-spec-delta mdx-spec-delta-removed', 'Removed', 'Removed'],
      ['mdx-spec-delta mdx-spec-delta-renamed', 'Renamed', 'Renamed'],
    ]);
    expect(
      page.querySelector('section.mdx-spec-delta-added h3')?.classList.contains('mdx-spec-requirement'),
    ).toBe(true);
    expect(
      page.querySelector('section.mdx-spec-delta-added h4')?.classList.contains('mdx-spec-scenario'),
    ).toBe(true);
    expect(page.querySelector('h1')?.closest('section')).toBeNull();
  });

  it('gives outline entries their role', () => {
    const { outline } = render(DELTA_SOURCE, DELTA);

    expect(outline.slice(0, 4).map((entry) => [entry.text, entry.role])).toEqual([
      ['Spec Delta', undefined],
      ['ADDED Requirements', 'deltaSection'],
      ['Requirement: Pin tabs', 'requirement'],
      ['Scenario: Pin a tab', 'scenario'],
    ]);
  });

  it('does not mark an indented heading, which the spec tool does not read as one', () => {
    const { page, outline } = render('## ADDED Requirements\n\n   ### Requirement: Indented\nText.', DELTA);

    expect(page.querySelector('h3')?.classList.contains('mdx-spec-requirement')).toBe(false);
    expect(outline.find((entry) => entry.text === 'Requirement: Indented')?.role).toBeUndefined();
  });

  it('marks requirements and scenarios of a main spec without delta sections', () => {
    const source =
      '## Requirements\n\n### Requirement: Open tabs\nText.\n\n#### Scenario: Open\n- **WHEN** opened\n\n## ADDED Requirements';
    const { page, outline } = render(source, MAIN);

    expect(page.querySelector('section')).toBeNull();
    expect(outline.map((entry) => entry.role)).toEqual([undefined, 'requirement', 'scenario', undefined]);
  });

  it('marks nothing in an ordinary document', () => {
    const { page, outline } = render(DELTA_SOURCE);

    expect(page.querySelector('[class*="mdx-spec-"]')).toBeNull();
    expect(outline.some((entry) => entry.role !== undefined)).toBe(false);
  });

  it('ignores mdx-spec classes the author wrote for roles, and escapes the labels', () => {
    const labels = { ...LABELS, added: '<img src=x onerror=alert(1)>' };
    const source =
      '<h3 class="mdx-spec-requirement">Fake</h3>\n\n## ADDED Requirements\n\n### Requirement: Real\nText.';
    const { page, outline } = render(source, { kind: 'deltaSpec', sectionLabels: labels });

    expect(page.querySelector('img')).toBeNull();
    expect(page.querySelector('.mdx-spec-label')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(outline.map((entry) => [entry.text, entry.role])).toEqual([
      ['ADDED Requirements', 'deltaSection'],
      ['Requirement: Real', 'requirement'],
    ]);
  });
});
