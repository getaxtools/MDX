import { specProjectsOverview } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { SpecProjectManifest } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SpecProjectsSection from './SpecProjectsSection.svelte';
import type { ScannedSpecRoot } from './specProjectTree';

const ROOT = { canonicalKey: 'c:\\projects\\shop', displayPath: 'C:\\Projects\\shop', fileName: 'shop' };

function manifestOf(paths: readonly string[], extra: Partial<SpecProjectManifest> = {}): SpecProjectManifest {
  return {
    root: ROOT,
    folders: [],
    files: paths.map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null })),
    links: [],
    isIncomplete: false,
    ...extra,
  };
}

const PROJECT_FILES = [
  'openspec/config.yaml',
  'openspec/specs/tabs/spec.md',
  'openspec/changes/add-pins/proposal.md',
  'openspec/changes/add-pins/tasks.md',
  'openspec/changes/archive/2026-10-01-add-tabs/proposal.md',
  'openspec/changes/archive/2026-11-02-add-search/proposal.md',
  'GEMINI.md',
  '.github/instructions/api/backend.instructions.md',
];

function scanned(manifest: SpecProjectManifest, taskTexts = new Map<string, string>()): ScannedSpecRoot {
  return {
    root: manifest.root,
    isIncomplete: manifest.isIncomplete,
    projects: specProjectsOverview(manifest, taskTexts),
    findingsByChange: new Map(),
  };
}

function renderSection(roots: readonly ScannedSpecRoot[] | undefined) {
  const onOpenDocument = vi.fn<(documentPath: string) => void>();
  render(SpecProjectsSection, {
    roots,
    translator: createTranslator(),
    isExpanded: true,
    onToggleExpanded: vi.fn(),
    onOpenDocument,
  });
  return { onOpenDocument };
}

describe('SpecProjectsSection', () => {
  it('shows each project with its format and its expanded changes with task progress', () => {
    const taskTexts = new Map([['openspec/changes/add-pins/tasks.md', '- [x] 1.1\n- [ ] 1.2\n- [ ] 1.3']]);

    renderSection([scanned(manifestOf(PROJECT_FILES), taskTexts)]);

    expect(
      screen.getByRole('treeitem', { name: 'shop, OpenSpec folder layout' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByRole('treeitem', { name: 'Changes, 1 item' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'add-pins, 1 of 3 tasks done' })).toBeTruthy();
  });

  it('keeps capabilities, the archive and agent instructions folded until opened', async () => {
    renderSection([scanned(manifestOf(PROJECT_FILES))]);
    const archive = screen.getByRole('treeitem', { name: 'Archive, 2 items' });

    expect(archive.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('treeitem', { name: 'Capabilities, 1 item' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    archive.focus();
    await userEvent.keyboard('{ArrowRight}');

    const archived = screen
      .getAllByRole('treeitem', { name: /archived on/ })
      .map((row) => row.getAttribute('aria-label'));
    expect(archived).toEqual(['add-search, archived on 2026-11-02', 'add-tabs, archived on 2026-10-01']);
  });

  it('lists agent instruction files with their folder and opens one with Enter', async () => {
    const { onOpenDocument } = renderSection([scanned(manifestOf(PROJECT_FILES))]);
    const group = screen.getByRole('treeitem', { name: 'Agent instructions, 2 items' });
    group.focus();
    await userEvent.keyboard('{ArrowRight}');
    const nested = screen.getByRole('treeitem', {
      name: 'backend.instructions.md in .github/instructions/api',
    });

    nested.focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('treeitem', { name: 'GEMINI.md' })).toBeTruthy();
    expect(onOpenDocument).toHaveBeenCalledWith(
      'C:\\Projects\\shop\\.github\\instructions\\api\\backend.instructions.md',
    );
  });

  it('opens the change page from a change row, and a change document once the row is unfolded', async () => {
    const onOpenChange = vi.fn<(rootKey: string, changeFolder: string) => void>();
    const onOpenDocument = vi.fn<(documentPath: string) => void>();
    render(SpecProjectsSection, {
      roots: [scanned(manifestOf(PROJECT_FILES))],
      translator: createTranslator(),
      isExpanded: true,
      onToggleExpanded: vi.fn(),
      onOpenDocument,
      onOpenChange,
    });
    const change = screen.getByRole('treeitem', { name: 'add-pins' });
    change.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith('c:\\projects\\shop', 'openspec/changes/add-pins');
    await userEvent.keyboard('{ArrowRight}');

    await userEvent.click(screen.getByRole('treeitem', { name: 'Proposal' }));

    expect(onOpenDocument).toHaveBeenCalledWith(
      'C:\\Projects\\shop\\openspec\\changes\\add-pins\\proposal.md',
    );
  });

  it('opens the dashboard of a project from its first row', async () => {
    const onOpenDashboard = vi.fn<(rootKey: string, folder: string) => void>();
    render(SpecProjectsSection, {
      roots: [scanned(manifestOf(PROJECT_FILES))],
      translator: createTranslator(),
      isExpanded: true,
      onToggleExpanded: vi.fn(),
      onOpenDocument: vi.fn(),
      onOpenDashboard,
    });

    await userEvent.click(screen.getByRole('treeitem', { name: 'Dashboard' }));

    expect(onOpenDashboard).toHaveBeenCalledWith('c:\\projects\\shop', '');
  });

  it('marks a linked folder that is not read', async () => {
    renderSection([scanned(manifestOf([], { links: [{ path: 'openspec', isFollowed: false }] }))]);
    await userEvent.click(screen.getByRole('treeitem', { name: 'Linked folders, 1 item' }));

    const link = screen.getByRole('treeitem', {
      name: "openspec, a linked folder outside this workspace's folders, not read",
    });
    expect(link.classList.contains('unavailable')).toBe(true);
  });

  it('says when a scan limit stopped the scan', () => {
    renderSection([scanned(manifestOf(PROJECT_FILES, { isIncomplete: true }))]);

    expect(screen.getByRole('status').textContent).toContain('Only part of C:\\Projects\\shop was read');
  });

  it('names the planning store a project points to', () => {
    const manifest = manifestOf([], {
      folders: ['openspec'],
      files: [{ path: 'openspec/config.yaml', sizeBytes: 1, modifiedAtMs: 1, text: 'store: team-plans' }],
    });

    renderSection([scanned(manifest)]);

    expect(screen.getByText(/live in the planning store "team-plans"/)).toBeTruthy();
  });

  it('says when no project was found', () => {
    renderSection([scanned(manifestOf(['src/readme.md']))]);
    expect(screen.getByText("No spec projects were found in this workspace's folders.")).toBeTruthy();
  });

  it('says the folders are being read before the scan ends', () => {
    renderSection(undefined);

    expect(screen.getByText('Reading spec projects...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Spec projects' })).toBeTruthy();
  });
});
