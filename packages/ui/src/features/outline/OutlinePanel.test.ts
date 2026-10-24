import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OutlinePanel from './OutlinePanel.svelte';

const OUTLINE = [
  { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
  { level: 2, text: 'Install', id: 'mdx-install', line: 4 },
];

function renderOutline(
  props: Partial<{ outline: typeof OUTLINE | undefined; currentHeadingId: string }> = {},
) {
  const onSelectHeading = vi.fn();
  render(OutlinePanel, { outline: OUTLINE, translator: createTranslator(), onSelectHeading, ...props });
  return { onSelectHeading };
}

describe('OutlinePanel', () => {
  it('lists the headings of the document, indenting deeper levels', () => {
    renderOutline();

    const outline = screen.getByRole('navigation', { name: 'Outline' });
    const items = [...outline.querySelectorAll('li')];

    expect(items.map((item) => item.textContent.trim())).toEqual(['Guide', 'Install']);
    expect(items[1]?.style.paddingInlineStart).toBe('0.75rem');
  });

  it('asks to go to the chosen heading, with the mouse or the keyboard', async () => {
    const { onSelectHeading } = renderOutline();

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    screen.getByRole('button', { name: 'Guide' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelectHeading.mock.calls).toEqual([[OUTLINE[1]], [OUTLINE[0]]]);
  });

  it('marks the section being read', () => {
    renderOutline({ currentHeadingId: 'mdx-install' });

    expect(screen.getByRole('button', { name: 'Install' }).getAttribute('aria-current')).toBe('location');
    expect(screen.getByRole('button', { name: 'Guide' }).hasAttribute('aria-current')).toBe(false);
  });

  it('explains when a document has no headings', () => {
    renderOutline({ outline: [] });

    expect(screen.getByText('This document has no headings.')).toBeTruthy();
  });

  it('explains that the outline needs an open document', () => {
    renderOutline({ outline: undefined });

    expect(screen.getByText('Open a document to see its headings here.')).toBeTruthy();
  });

  it('can be reached with F6 like the other side bar views', () => {
    renderOutline();

    expect(screen.getByRole('navigation', { name: 'Outline' }).hasAttribute('data-focus-region')).toBe(true);
  });
});
