import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OutlinePanel from './OutlinePanel.svelte';

const OUTLINE = [
  { level: 1, text: 'Guide', id: 'mdx-guide' },
  { level: 2, text: 'Install', id: 'mdx-install' },
];

describe('OutlinePanel', () => {
  it('lists the headings of the document, indenting deeper levels', () => {
    render(OutlinePanel, { outline: OUTLINE, translator: createTranslator() });

    const outline = screen.getByRole('navigation', { name: 'Outline' });
    const items = [...outline.querySelectorAll('li')];

    expect(items.map((item) => item.textContent.trim())).toEqual(['Guide', 'Install']);
    expect(items[1]?.style.paddingInlineStart).toBe('0.75rem');
  });

  it('scrolls to the chosen heading and moves focus to it', async () => {
    const heading = document.createElement('h2');
    heading.id = 'mdx-install';
    const scrollIntoView = vi.fn();
    heading.scrollIntoView = scrollIntoView;
    document.body.append(heading);
    render(OutlinePanel, { outline: OUTLINE, translator: createTranslator() });

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });

  it('marks the section being read', () => {
    render(OutlinePanel, {
      outline: OUTLINE,
      currentHeadingId: 'mdx-install',
      translator: createTranslator(),
    });

    expect(screen.getByRole('button', { name: 'Install' }).getAttribute('aria-current')).toBe('location');
    expect(screen.getByRole('button', { name: 'Guide' }).hasAttribute('aria-current')).toBe(false);
  });

  it('explains when a document has no headings', () => {
    render(OutlinePanel, { outline: [], translator: createTranslator() });

    expect(screen.getByText('This document has no headings.')).toBeTruthy();
  });
});
