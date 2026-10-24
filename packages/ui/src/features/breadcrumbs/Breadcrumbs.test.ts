import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Breadcrumbs from './Breadcrumbs.svelte';

const OUTLINE = [
  { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
  { level: 2, text: 'Install', id: 'mdx-install', line: 4 },
];

function renderBreadcrumbs({ hasFolder = true, currentHeadingId = 'mdx-install' } = {}) {
  const onRevealInExplorer = vi.fn();
  const onSelectHeading = vi.fn();
  render(Breadcrumbs, {
    displayPath: 'C:\\Docs\\guides\\Guide.md',
    fileName: 'Guide.md',
    hasFolder,
    outline: OUTLINE,
    currentHeadingId,
    translator: createTranslator(),
    onRevealInExplorer,
    onSelectHeading,
  });
  return { onRevealInExplorer, onSelectHeading };
}

describe('Breadcrumbs', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows the folders, the document and the current heading', () => {
    renderBreadcrumbs();

    const trail = screen.getByRole('navigation', { name: 'Breadcrumbs' });
    const parts = [...trail.querySelectorAll('li')].map((part) => part.textContent.trim());

    expect(parts).toEqual(['Docs', 'guides', 'Guide.md', 'Install']);
    expect(screen.getByText('Guide.md').getAttribute('aria-current')).toBe('page');
  });

  it('shows the document in the Explorer from a folder', async () => {
    const { onRevealInExplorer } = renderBreadcrumbs();

    await userEvent.click(screen.getByRole('button', { name: 'guides' }));

    expect(onRevealInExplorer).toHaveBeenCalledOnce();
  });

  it('asks to go to a heading chosen from the heading list', async () => {
    const { onSelectHeading } = renderBreadcrumbs();

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Guide' }));

    expect(onSelectHeading).toHaveBeenCalledWith(OUTLINE[0]);
  });

  it('shows only the document name for a new document', () => {
    renderBreadcrumbs({ hasFolder: false });

    expect(screen.queryByRole('button', { name: 'Docs' })).toBeNull();
    expect(screen.getByText('Guide.md')).toBeTruthy();
  });
});
