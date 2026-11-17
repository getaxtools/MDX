import { specProjectsOverview } from '@mdx/core';
import type { SpecProjectManifest } from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { relativeHref, specDocumentPlaceOf, specDocumentRenderingOf } from './specCrossLinkTargets';
import type { SpecProjectsView } from './SpecViewerActions';

const ROOT = { canonicalKey: 'c:\\projects\\shop', displayPath: 'C:\\Projects\\shop', fileName: 'shop' };
const renderer = createMarkdownRenderer({ window });

const TEXTS: Readonly<Record<string, string>> = {
  'openspec/specs/ui/spec.md':
    '# ui Specification\n\n## Purpose\nThemes.\n\n## Requirements\n\n### Requirement: Theme selection\nIt SHALL.\n',
  'openspec/changes/add-themes/specs/ui/spec.md':
    '## MODIFIED Requirements\n\n### Requirement: Theme selection\nIt SHALL change.\n',
  'openspec/changes/add-themes/proposal.md': '- `ui`: themes',
  'specs/002-sharing/spec.md':
    '# Sharing\n\n### User Story 2 - Share an album (Priority: P1)\n\n## Requirements\n\n- **FR-001**: System MUST share.\n',
  'specs/002-sharing/tasks.md': '- [ ] T011 [US2] Share\n',
};

function view(): SpecProjectsView {
  const manifest: SpecProjectManifest = {
    root: ROOT,
    folders: ['.specify'],
    files: Object.keys(TEXTS).map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null })),
    links: [],
    isIncomplete: false,
  };
  const projects = specProjectsOverview(manifest);
  return {
    roots: [{ root: ROOT, isIncomplete: false, projects, findingsByChange: new Map() }],
    unreadableFolders: [],
  };
}

const services = {
  readText: (_rootPath: string, relativePath: string) => Promise.resolve(TEXTS[relativePath]),
  outlineOf: (text: string) => renderer.outlineOf(text),
};

async function renderingOf(relativePath: string) {
  const location = {
    canonicalKey: '',
    displayPath: `C:\\Projects\\shop\\${relativePath.replaceAll('/', '\\')}`,
    fileName: '',
  };
  const place = specDocumentPlaceOf(view(), location);
  if (!place) throw new Error('not in a project');
  return specDocumentRenderingOf(place, services);
}

describe('cross-links between spec documents', () => {
  it('links a story label in tasks to the user story in the feature spec', async () => {
    const rendering = await renderingOf('specs/002-sharing/tasks.md');

    expect(rendering.kind).toBe('specDocument');
    expect(rendering.links.storyLinks?.get('US2')).toBe(
      'spec.md#mdx-user-story-2---share-an-album-priority-p1',
    );
    expect(rendering.links.requirementIdLinks?.get('FR-001')).toBe('spec.md#mdx-requirements');
  });

  it('links a modified requirement of a delta to the current spec', async () => {
    const rendering = await renderingOf('openspec/changes/add-themes/specs/ui/spec.md');

    expect(rendering.kind).toBe('deltaSpec');
    expect(rendering.links.requirementLinks?.get('Theme selection')).toBe(
      '../../../../specs/ui/spec.md#mdx-requirement-theme-selection',
    );
  });

  it('links capability names in a proposal to their spec', async () => {
    const rendering = await renderingOf('openspec/changes/add-themes/proposal.md');

    expect(rendering.links.capabilityLinks?.get('ui')).toBe('../../specs/ui/spec.md');
  });

  it('renders a feature spec with its user stories marked, and a capability spec as a main spec', async () => {
    expect((await renderingOf('specs/002-sharing/spec.md')).kind).toBe('featureSpec');
    expect((await renderingOf('openspec/specs/ui/spec.md')).kind).toBe('mainSpec');
  });

  it('writes relative links that climb out of the folder and encode names', () => {
    expect(relativeHref('specs/a/tasks.md', 'specs/a/spec.md', 'mdx-x')).toBe('spec.md#mdx-x');
    expect(relativeHref('a/b/c.md', 'd/my spec.md')).toBe('../../d/my%20spec.md');
  });
});
