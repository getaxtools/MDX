import { specProjectsOverview, type StructuralFinding } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { SpecProjectManifest } from '@mdx/platform';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SpecDashboard from './SpecDashboard.svelte';
import type { ShownDashboard } from './specDashboard';

const ROOT = { canonicalKey: 'c:\\projects\\shop', displayPath: 'C:\\Projects\\shop', fileName: 'shop' };

function file(path: string, text: string | null = null) {
  return { path, sizeBytes: 1, modifiedAtMs: 1, text };
}

const MANIFEST: SpecProjectManifest = {
  root: ROOT,
  folders: [],
  files: [
    file('openspec/config.yaml', 'schema: spec-driven'),
    file('openspec/changes/add-pins/.openspec.yaml', 'schema: spec-driven\ncreated: 2026-11-12\n'),
    file('openspec/changes/add-pins/proposal.md'),
    file('openspec/changes/add-pins/tasks.md'),
    file('openspec/changes/add-search/tasks.md'),
    file('openspec/changes/tidy-up/proposal.md'),
  ],
  links: [],
  isIncomplete: false,
};

const TASKS = new Map([
  ['openspec/changes/add-pins/tasks.md', `${'- [x] t\n'.repeat(3)}${'- [ ] t\n'.repeat(5)}`],
  ['openspec/changes/add-search/tasks.md', '- [x] t\n'.repeat(5)],
]);

function finding(severity: 'error' | 'warning'): StructuralFinding {
  return {
    rule: severity === 'error' ? 'requirementWithoutScenario' : 'purposeTooShort',
    severity,
    path: 'specs/tabs/spec.md',
  };
}

function dashboard(): ShownDashboard {
  const projects = specProjectsOverview(MANIFEST, TASKS);
  const findingsByChange = new Map([
    ['openspec/changes/add-pins', [finding('error'), finding('warning'), finding('warning')]],
  ]);
  const project = projects[0];
  if (!project) throw new Error('no project');
  return { scanned: { root: ROOT, isIncomplete: false, projects, findingsByChange }, project };
}

function rowOf(name: string): HTMLElement {
  const header = screen.getByRole('rowheader', { name });
  const row = header.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

function cellsOf(name: string): string[] {
  return within(rowOf(name))
    .getAllByRole('cell')
    .map((cell) => cell.textContent.trim());
}

describe('SpecDashboard', () => {
  it('shows a change in progress with its creation day, tasks and problems', () => {
    render(SpecDashboard, {
      dashboard: dashboard(),
      translator: createTranslator(),
      onOpenChange: vi.fn(),
    });

    expect(screen.getByRole('heading', { name: 'Dashboard - shop' })).toBeTruthy();
    expect(cellsOf('add-pins')).toEqual(['2026-11-12', '3 of 8', '1 error, 2 warnings', 'In progress']);
  });

  it('shows a change whose tasks are all done as complete', () => {
    render(SpecDashboard, {
      dashboard: dashboard(),
      translator: createTranslator(),
      onOpenChange: vi.fn(),
    });

    expect(cellsOf('add-search')).toEqual(['', '5 of 5', 'None', 'Tasks complete']);
  });

  it('shows a change without tasks', () => {
    render(SpecDashboard, {
      dashboard: dashboard(),
      translator: createTranslator(),
      onOpenChange: vi.fn(),
    });

    expect(cellsOf('tidy-up')).toEqual(['', 'None', 'None', 'No tasks']);
  });

  it('opens the page of a change from its name with the keyboard', async () => {
    const onOpenChange = vi.fn<(changeFolder: string) => void>();
    render(SpecDashboard, { dashboard: dashboard(), translator: createTranslator(), onOpenChange });

    screen.getByRole('button', { name: 'add-pins' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onOpenChange).toHaveBeenCalledWith('openspec/changes/add-pins');
  });

  it('says that it checks a subset of the spec tool rules', () => {
    render(SpecDashboard, {
      dashboard: dashboard(),
      translator: createTranslator(),
      onOpenChange: vi.fn(),
    });

    expect(
      screen.getByText('Checks a subset of the rules of the OpenSpec command-line tool 2.0.0.'),
    ).toBeTruthy();
  });
});
