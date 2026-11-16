import { specProjectsOverview, type StructuralFinding } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { SpecProjectManifest } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SpecChangePage from './SpecChangePage.svelte';
import type { ShownChangePage } from './specChangePage';

const ROOT = { canonicalKey: 'c:\\projects\\shop', displayPath: 'C:\\Projects\\shop', fileName: 'shop' };
const CHANGE = 'openspec/changes/add-pins';

function file(path: string, text: string | null = null) {
  return { path, sizeBytes: 1, modifiedAtMs: 1, text };
}

const MANIFEST: SpecProjectManifest = {
  root: ROOT,
  folders: [],
  files: [
    file(`${CHANGE}/.openspec.yaml`, 'schema: spec-driven\ncreated: 2026-11-12\n'),
    file(`${CHANGE}/proposal.md`),
    file(`${CHANGE}/tasks.md`),
    file(`${CHANGE}/specs/tabs/spec.md`),
  ],
  links: [],
  isIncomplete: false,
};

const NO_SCENARIO: StructuralFinding = {
  rule: 'requirementWithoutScenario',
  severity: 'error',
  path: 'specs/tabs/spec.md',
  line: 5,
  subject: 'Pin tabs',
};
const LONG_DESCRIPTION: StructuralFinding = {
  rule: 'addedRequirementTooLong',
  severity: 'warning',
  path: 'specs/tabs/spec.md',
  line: 12,
  subject: 'Pin order',
};

function pageWith(findings: readonly StructuralFinding[]): ShownChangePage {
  const projects = specProjectsOverview(MANIFEST);
  const project = projects[0];
  const change = project?.activeChanges[0];
  if (!project || !change) throw new Error('no change');
  const findingsByChange = new Map([[CHANGE, findings]]);
  return { scanned: { root: ROOT, isIncomplete: false, projects, findingsByChange }, project, change };
}

function renderPage(findings: readonly StructuralFinding[]) {
  const onOpenDocument = vi.fn<(documentPath: string) => void>();
  const onOpenFinding = vi.fn<(documentPath: string, line: number | undefined) => void>();
  render(SpecChangePage, {
    page: pageWith(findings),
    translator: createTranslator(),
    onOpenDocument,
    onOpenFinding,
  });
  return { onOpenDocument, onOpenFinding };
}

describe('SpecChangePage', () => {
  it('shows the creation day, the schema and the documents, marking a design not written', async () => {
    const { onOpenDocument } = renderPage([]);

    expect(screen.getByRole('heading', { name: 'add-pins' })).toBeTruthy();
    expect(screen.getByText('2026-11-12')).toBeTruthy();
    expect(screen.getByText('spec-driven')).toBeTruthy();
    expect(screen.getByText('Design: not written')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Spec delta: tabs' }));
    expect(onOpenDocument).toHaveBeenCalledWith(
      'C:\\Projects\\shop\\openspec\\changes\\add-pins\\specs\\tabs\\spec.md',
    );
  });

  it('lists each finding with its message, and opens its document at its line', async () => {
    const { onOpenFinding } = renderPage([NO_SCENARIO]);

    expect(
      screen.getByText('Requirement "Pin tabs" must include at least one scenario with text.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'specs/tabs/spec.md, line 5' }));

    expect(onOpenFinding).toHaveBeenCalledWith(
      'C:\\Projects\\shop\\openspec\\changes\\add-pins\\specs\\tabs\\spec.md',
      5,
    );
  });

  it('counts warnings as failures only when Strict is on', async () => {
    renderPage([LONG_DESCRIPTION]);
    expect(screen.getByRole('status').textContent).toContain('The change passes the checks.');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Strict: count warnings as failures' }));

    expect(screen.getByRole('status').textContent).toContain('The change fails the checks.');
    expect(
      screen.getByText(
        'The description of "Pin order" is longer than 500 characters; strict checking fails on it.',
      ),
    ).toBeTruthy();
  });

  it('fails the checks on an error, and says it checks a subset of the spec tool rules', () => {
    renderPage([NO_SCENARIO]);

    expect(screen.getByRole('status').textContent).toContain('The change fails the checks.');
    expect(
      screen.getByText('Checks a subset of the rules of the OpenSpec command-line tool 2.0.0.'),
    ).toBeTruthy();
  });
});
