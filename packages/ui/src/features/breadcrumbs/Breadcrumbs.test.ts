import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Breadcrumbs from './Breadcrumbs.svelte';

const OUTLINE = [
  { level: 1, text: 'Guide', id: 'mdx-guide' },
  { level: 2, text: 'Install', id: 'mdx-install' },
];

function renderBreadcrumbs({ hasFolder = true, currentHeadingId = 'mdx-install' } = {}) {
  const onRevealInExplorer = vi.fn();
  render(Breadcrumbs, {
    displayPath: 'C:\\Docs\\guides\\Guide.md',
    fileName: 'Guide.md',
    hasFolder,
    outline: OUTLINE,
    currentHeadingId,
    translator: createTranslator(),
    onRevealInExplorer,
  });
  return { onRevealInExplorer };
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

  it('jumps to a heading chosen from the heading list', async () => {
    renderBreadcrumbs();
    const heading = document.createElement('h1');
    heading.id = 'mdx-guide';
    const scrollIntoView = vi.fn();
    heading.scrollIntoView = scrollIntoView;
    document.body.append(heading);

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Guide' }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(heading);
  });

  it('shows only the document name for a new document', () => {
    renderBreadcrumbs({ hasFolder: false });

    expect(screen.queryByRole('button', { name: 'Docs' })).toBeNull();
    expect(screen.getByText('Guide.md')).toBeTruthy();
  });
});
