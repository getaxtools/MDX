import { specProjectsOverview } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { SpecProjectManifest } from '@mdx/platform';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SpecDashboard from './SpecDashboard.svelte';
import SpecProjectsSection from './SpecProjectsSection.svelte';
import type { ScannedSpecRoot } from './specProjectTree';

const ROOT = { canonicalKey: 'c:\\projects\\shop', displayPath: 'C:\\Projects\\shop', fileName: 'shop' };

const MANIFEST: SpecProjectManifest = {
  root: ROOT,
  folders: [],
  files: [
    '.kiro/specs/checkout/requirements.md',
    '.kiro/specs/checkout/tasks.md',
    '.kiro/specs/login-crash/bugfix.md',
    'adr/0001-use-tauri.md',
  ].map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null })),
  links: [],
  isIncomplete: false,
};

const TEXTS = new Map([
  ['.kiro/specs/checkout/tasks.md', '- [x] 1. Cart\n- [ ] 2. Pay'],
  ['adr/0001-use-tauri.md', '---\nstatus: accepted\ndate: 2026-10-17\n---\n# Use Tauri\n'],
]);

function scanned(): ScannedSpecRoot {
  return {
    root: ROOT,
    isIncomplete: false,
    projects: specProjectsOverview(MANIFEST, TEXTS),
    findingsByChange: new Map(),
  };
}

describe('requirements, design and tasks folders and decision records', () => {
  it('lists the specs with their progress and documents, and the decision records with their status', async () => {
    const onOpenDocument = vi.fn<(documentPath: string) => void>();
    render(SpecProjectsSection, {
      roots: [scanned()],
      translator: createTranslator(),
      isExpanded: true,
      onToggleExpanded: vi.fn(),
      onOpenDocument,
    });

    const checkout = screen.getByRole('treeitem', { name: 'checkout' });
    expect(checkout.textContent).toContain('1 of 2');
    expect(screen.getByRole('treeitem', { name: 'login-crash, a bug fix' })).toBeTruthy();
    checkout.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.queryByRole('treeitem', { name: 'Design' })).toBeNull();
    await userEvent.click(screen.getByRole('treeitem', { name: 'Decision records, 1 item' }));
    await userEvent.click(screen.getByRole('treeitem', { name: '0001 Use Tauri, accepted' }));

    expect(onOpenDocument).toHaveBeenCalledWith('C:\\Projects\\shop\\adr\\0001-use-tauri.md');
  });

  it('shows the specs and decision records on the dashboard', () => {
    const root = scanned();
    const project = root.projects[0];
    if (!project) throw new Error('no project');

    render(SpecDashboard, {
      dashboard: { scanned: root, project },
      translator: createTranslator(),
      onOpenChange: vi.fn(),
    });

    const cellsOf = (name: string) =>
      within(screen.getByRole('rowheader', { name }).closest('tr') ?? document.body)
        .getAllByRole('cell')
        .map((cell) => cell.textContent.trim());
    expect(cellsOf('checkout')).toEqual(['Feature', 'Design', '1 of 2']);
    expect(cellsOf('login-crash')).toEqual(['Bug fix', 'Design, Tasks', 'None']);
    expect(cellsOf('0001')).toEqual(['Use Tauri', 'accepted', '2026-10-17']);
  });
});
