import { createTranslator } from '@mdx/i18n';
import type { OutlineEntry } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OutlinePanel from './OutlinePanel.svelte';

function heading(level: number, text: string, role?: OutlineEntry['role']): OutlineEntry {
  const id = `mdx-${text.toLowerCase().replace(/\W+/g, '-')}`;
  return role ? { level, text, id, line: 0, role } : { level, text, id, line: 0 };
}

const SPEC_OUTLINE: readonly OutlineEntry[] = [
  heading(2, 'Requirements'),
  heading(3, 'Requirement: Open', 'requirement'),
  heading(4, 'Scenario: Open a file', 'scenario'),
  heading(4, 'Scenario: Open twice', 'scenario'),
  heading(3, 'Requirement: Close', 'requirement'),
  heading(4, 'Scenario: Close a tab', 'scenario'),
  heading(3, 'Requirement: Pin', 'requirement'),
  heading(4, 'Scenario: Pin a tab', 'scenario'),
];

function listedTexts(): string[] {
  return screen.getAllByRole('button').map((button) => button.getAttribute('title') ?? '');
}

describe('the outline of a spec', () => {
  it('shows the role of each requirement and scenario', () => {
    render(OutlinePanel, { outline: SPEC_OUTLINE, translator: createTranslator(), onSelectHeading: vi.fn() });

    const scenario = screen.getByRole('button', { name: 'Scenario: Open a file' });
    expect(scenario.querySelector('.role')?.textContent).toBe('Scenario');
    expect(screen.getByRole('button', { name: 'Requirements' }).querySelector('.role')).toBeNull();
  });

  it('lists the requirements only when asked, and hides the scenarios', async () => {
    render(OutlinePanel, { outline: SPEC_OUTLINE, translator: createTranslator(), onSelectHeading: vi.fn() });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Requirements only' }));

    expect(listedTexts()).toEqual(['Requirement: Open', 'Requirement: Close', 'Requirement: Pin']);
  });

  it('marks the requirement of the current scenario while scenarios are hidden', async () => {
    render(OutlinePanel, {
      outline: SPEC_OUTLINE,
      currentHeadingId: 'mdx-scenario-close-a-tab',
      translator: createTranslator(),
      onSelectHeading: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Scenario: Close a tab' }).getAttribute('aria-current')).toBe(
      'location',
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Requirements only' }));

    expect(screen.getByRole('button', { name: 'Requirement: Close' }).getAttribute('aria-current')).toBe(
      'location',
    );
  });

  it('offers no filter for an ordinary document', () => {
    render(OutlinePanel, {
      outline: [heading(1, 'Guide'), heading(2, 'Install')],
      translator: createTranslator(),
      onSelectHeading: vi.fn(),
    });

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
