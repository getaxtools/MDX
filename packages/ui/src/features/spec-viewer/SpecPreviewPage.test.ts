import { applyDelta } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SpecPreviewPage from './SpecPreviewPage.svelte';
import type { SpecPreview } from './specPreview';

function requirement(name: string, scenario: string): string {
  return `### Requirement: ${name}\nThe viewer SHALL ${name}.\n\n#### Scenario: ${scenario}\n- **WHEN** used\n- **THEN** it works\n`;
}

const CURRENT = `# tabs Specification\n\n## Purpose\nTabs.\n\n## Requirements\n\n${requirement('A', 'A works')}\n${requirement('B', 'B works')}`;

function previewOf(deltaText: string): SpecPreview {
  const application = applyDelta({
    capability: 'tabs',
    changeName: 'add-pins',
    deltaText,
    currentSpecText: CURRENT,
  });
  return { changeName: 'add-pins', capability: 'tabs', application, html: '<p>The spec</p>' };
}

function newCapabilityPreviewOf(deltaText: string): SpecPreview {
  const application = applyDelta({ capability: 'tabs', changeName: 'add-pins', deltaText });
  return { changeName: 'add-pins', capability: 'tabs', application, html: '<p>The spec</p>' };
}

function listedRequirements(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent.replace(/\s+/g, ' ').trim());
}

describe('SpecPreviewPage', () => {
  it('lists the requirements in order with what the change does to each', () => {
    const delta = `## MODIFIED Requirements\n\n${requirement('B', 'B works').replace('SHALL B', 'SHALL B better')}\n## ADDED Requirements\n\n${requirement('C', 'C works')}`;

    render(SpecPreviewPage, { preview: previewOf(delta), translator: createTranslator() });

    expect(screen.getByRole('heading', { name: 'tabs after add-pins' })).toBeTruthy();
    expect(listedRequirements()).toEqual(['A', 'B Modified', 'C Added']);
    expect(screen.getByText('The spec')).toBeTruthy();
  });

  it('shows a new capability with its added requirements', () => {
    const delta = `## Purpose\nLets a user pin tabs.\n\n## ADDED Requirements\n\n${requirement('Pin', 'Pin works')}`;

    render(SpecPreviewPage, { preview: newCapabilityPreviewOf(delta), translator: createTranslator() });

    expect(listedRequirements()).toEqual(['Pin Added']);
  });

  it('says why a delta cannot be applied, naming the requirement, and shows no preview', () => {
    const delta = `## MODIFIED Requirements\n\n${requirement('Export data', 'Export')}`;

    render(SpecPreviewPage, { preview: previewOf(delta), translator: createTranslator() });

    expect(screen.getByRole('alert').textContent).toBe('Requirement "Export data" was not found.');
    expect(screen.queryByText('The spec')).toBeNull();
  });
});
