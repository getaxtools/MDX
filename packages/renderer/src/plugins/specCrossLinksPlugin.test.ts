import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';
import type { SpecCrossLinks, SpecStructureRendering } from './specStructurePlugin';

const LABELS = { added: 'Added', modified: 'Modified', removed: 'Removed', renamed: 'Renamed' } as const;
const renderer = createMarkdownRenderer({ window });

function linksIn(source: string, kind: SpecStructureRendering['kind'], links: SpecCrossLinks) {
  const html = renderer.render(source, { specStructure: { kind, sectionLabels: LABELS, links } }).html;
  const page = new DOMParser().parseFromString(html, 'text/html');
  return [...page.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('specCrossLinksPlugin', () => {
  it('links user story labels in tasks to their story in the feature spec', () => {
    const links = linksIn('- [ ] T011 [US2] Share an album', 'specDocument', {
      storyLinks: new Map([['US2', 'spec.md#mdx-user-story-2-share']]),
    });

    expect(links).toEqual([['[US2]', 'spec.md#mdx-user-story-2-share']]);
  });

  it('links requirement identifiers in a plan to the section of the spec that defines them', () => {
    const links = linksIn('Covers FR-001 and SC-002.', 'specDocument', {
      requirementIdLinks: new Map([
        ['FR-001', 'spec.md#mdx-requirements'],
        ['SC-002', 'spec.md#mdx-success-criteria'],
      ]),
    });

    expect(links).toEqual([
      ['FR-001', 'spec.md#mdx-requirements'],
      ['SC-002', 'spec.md#mdx-success-criteria'],
    ]);
  });

  it('links capability names written as code in a proposal', () => {
    const links = linksIn('- `tabs`: pin tabs\n- `ui`: unchanged', 'specDocument', {
      capabilityLinks: new Map([['tabs', '../../specs/tabs/spec.md']]),
    });

    expect(links).toEqual([['tabs', '../../specs/tabs/spec.md']]);
  });

  it('links modified, removed and renamed requirements of a delta to the current spec', () => {
    const source = [
      '## ADDED Requirements',
      '### Requirement: Theme selection',
      '## MODIFIED Requirements',
      '### Requirement: Theme selection',
      'Text.',
      '## REMOVED Requirements',
      '- ### Requirement: Old layout',
      '## RENAMED Requirements',
      '- FROM: `### Requirement: Close tabs`',
      '- TO: `### Requirement: Shut tabs`',
    ].join('\n');

    const links = linksIn(source, 'deltaSpec', {
      requirementLinks: new Map([
        ['Theme selection', '../../../../specs/ui/spec.md#mdx-requirement-theme-selection'],
        ['Old layout', '../../../../specs/ui/spec.md#mdx-requirement-old-layout'],
        ['Close tabs', '../../../../specs/ui/spec.md#mdx-requirement-close-tabs'],
      ]),
    });

    expect(links.map(([, href]) => href)).toEqual([
      '../../../../specs/ui/spec.md#mdx-requirement-theme-selection',
      '../../../../specs/ui/spec.md#mdx-requirement-old-layout',
      '../../../../specs/ui/spec.md#mdx-requirement-close-tabs',
    ]);
  });

  it('leaves unknown labels, identifiers and capabilities as plain text', () => {
    const links = linksIn('[US9] needs FR-999 in `other`.', 'specDocument', {
      storyLinks: new Map([['US1', 'spec.md#a']]),
      requirementIdLinks: new Map([['FR-001', 'spec.md#b']]),
      capabilityLinks: new Map([['tabs', 'specs/tabs/spec.md']]),
    });

    expect(links).toEqual([]);
  });

  it('does not link inside an existing link', () => {
    const links = linksIn('[see US2 [US2]](other.md)', 'specDocument', {
      storyLinks: new Map([['US2', 'spec.md#story']]),
    });

    expect(links).toEqual([['see US2 [US2]', 'other.md']]);
  });

  it('marks the user stories of a feature spec as its requirements', () => {
    const source =
      '## User Scenarios\n\n### User Story 1 - Albums (Priority: P1)\n\nText.\n\n### Edge Cases\n';
    const { outline } = renderer.render(source, {
      specStructure: { kind: 'featureSpec', sectionLabels: LABELS },
    });

    expect(outline.map((entry) => entry.role)).toEqual([undefined, 'requirement', undefined]);
  });
});
