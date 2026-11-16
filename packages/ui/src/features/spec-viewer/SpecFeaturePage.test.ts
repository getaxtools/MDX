import { specProjectsOverview } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { SpecProjectManifest } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SpecDashboard from './SpecDashboard.svelte';
import SpecFeaturePage from './SpecFeaturePage.svelte';
import SpecProjectsSection from './SpecProjectsSection.svelte';
import type { ScannedSpecRoot } from './specProjectTree';

const ROOT = {
  canonicalKey: 'c:\\projects\\albums',
  displayPath: 'C:\\Projects\\albums',
  fileName: 'albums',
};
const FEATURE = 'specs/002-sharing';

function file(path: string, text: string | null = null) {
  return { path, sizeBytes: 1, modifiedAtMs: 1, text };
}

const MANIFEST: SpecProjectManifest = {
  root: ROOT,
  folders: [],
  files: [
    file('.specify/memory/constitution.md'),
    file('.specify/feature.json', '{"feature": "002-sharing"}'),
    file('specs/001-photo-albums/spec.md'),
    file(`${FEATURE}/spec.md`),
    file(`${FEATURE}/plan.md`),
    file(`${FEATURE}/tasks.md`),
    file(`${FEATURE}/contracts/api.yaml`),
    file(`${FEATURE}/contracts/events.md`),
  ],
  links: [],
  isIncomplete: false,
};

const TEXTS = new Map([
  [`${FEATURE}/spec.md`, '**Status**: Draft\n\nShare with [NEEDS CLARIFICATION: who?]\n'],
  [
    `${FEATURE}/tasks.md`,
    '## Phase 1: Sharing\n\n- [X] T010 [P] [US1] Add a share link\n- [ ] T011 [US1] Revoke a link\n',
  ],
]);

function scanned(): ScannedSpecRoot {
  return {
    root: ROOT,
    isIncomplete: false,
    projects: specProjectsOverview(MANIFEST, TEXTS),
    findingsByChange: new Map(),
  };
}

function sharing() {
  const root = scanned();
  const feature = root.projects[0]?.features.find((candidate) => candidate.name === '002-sharing');
  if (!feature) throw new Error('no feature');
  return { scanned: root, feature };
}

describe('feature pages', () => {
  it('lists the documents a feature has, and marks the others not written', () => {
    render(SpecFeaturePage, {
      page: sharing(),
      translator: createTranslator(),
      onOpenDocument: vi.fn(),
      onOpenFinding: vi.fn(),
    });

    expect(screen.getByRole('button', { name: 'Spec' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contract: api.yaml' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contract: events.md' })).toBeTruthy();
    for (const missing of ['Research', 'Data model', 'Quickstart']) {
      expect(screen.getByText(`${missing}: not written`)).toBeTruthy();
    }
  });

  it('shows progress per user story, the parallel tasks and the open clarifications', async () => {
    const onOpenFinding = vi.fn<(documentPath: string, line: number | undefined) => void>();
    render(SpecFeaturePage, {
      page: sharing(),
      translator: createTranslator(),
      onOpenDocument: vi.fn(),
      onOpenFinding,
    });

    expect(screen.getByRole('rowheader', { name: 'US1' }).closest('tr')?.textContent).toContain('1 of 2');
    expect(screen.getByText(/T010 Add a share link/).textContent).toContain('Parallel');
    expect(screen.getByRole('heading', { name: 'Open clarifications: 1' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: `${FEATURE}/spec.md, line 3` }));
    expect(onOpenFinding).toHaveBeenCalledWith('C:\\Projects\\albums\\specs\\002-sharing\\spec.md', 3);
  });

  it('marks the current feature in the sidebar and on its page', () => {
    render(SpecProjectsSection, {
      roots: [scanned()],
      translator: createTranslator(),
      isExpanded: true,
      onToggleExpanded: vi.fn(),
      onOpenDocument: vi.fn(),
    });

    expect(screen.getByRole('treeitem', { name: '002-sharing, the current feature' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: '001-photo-albums' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: 'Constitution' })).toBeTruthy();
  });

  it('opens a feature page from the sidebar', async () => {
    const onOpenFeature = vi.fn<(rootKey: string, featureFolder: string) => void>();
    render(SpecProjectsSection, {
      roots: [scanned()],
      translator: createTranslator(),
      isExpanded: true,
      onToggleExpanded: vi.fn(),
      onOpenDocument: vi.fn(),
      onOpenFeature,
    });

    await userEvent.click(screen.getByRole('treeitem', { name: '001-photo-albums' }));

    expect(onOpenFeature).toHaveBeenCalledWith('c:\\projects\\albums', 'specs/001-photo-albums');
  });

  it('lists the features on the dashboard with their number, status, tasks and clarifications', () => {
    const root = scanned();
    const project = root.projects[0];
    if (!project) throw new Error('no project');
    render(SpecDashboard, {
      dashboard: { scanned: root, project },
      translator: createTranslator(),
      onOpenChange: vi.fn(),
    });

    const header = screen.getByRole('rowheader', { name: /002-sharing/ });
    const cells = [...(header.closest('tr')?.querySelectorAll('td') ?? [])].map((cell) =>
      cell.textContent.trim(),
    );
    expect(header.textContent).toContain('Current');
    expect(cells).toEqual(['002', 'Draft', '1 of 2', '1']);
    expect(screen.queryByText('This project has no active changes.')).toBeNull();
  });
});
