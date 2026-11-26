import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { KIND_ICONS } from '../control-wheel/kindPresentation';
import NewWorkspacePreview from './NewWorkspacePreview.svelte';
import { WORKSPACE_ICON_PATHS } from './workspacePresentation';

const translator = createTranslator();

function drawnPathsOf(tile: Element): string[] {
  return [...tile.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? '');
}

function tileOf(preview: HTMLElement): HTMLElement {
  const tile = preview.querySelector<HTMLElement>('.tile');
  if (!tile) throw new Error('the preview has no tile');
  return tile;
}

describe('new workspace preview', () => {
  it('the dialog previews the new workspace', () => {
    render(NewWorkspacePreview, {
      name: 'Handbook',
      kindId: 'markdownViewer',
      icon: 'book',
      colour: 'blue',
      translator,
    });

    const preview = screen.getByRole('group', { name: 'Preview' });

    expect(drawnPathsOf(tileOf(preview))).toEqual(WORKSPACE_ICON_PATHS.book);
    expect(tileOf(preview).style.background).toBe('rgb(59, 111, 216)');
    expect(within(preview).getByText('Handbook')).toBeTruthy();
    expect(
      within(preview).getByText('Markdown viewer - folders, recent files, favourites and tabs'),
    ).toBeTruthy();
  });

  it('without an icon the tile shows the icon of the kind', () => {
    render(NewWorkspacePreview, { name: 'Journal', kindId: 'notes', translator });

    const preview = screen.getByRole('group', { name: 'Preview' });

    expect(drawnPathsOf(tileOf(preview))).toEqual(KIND_ICONS.notes);
    expect(tileOf(preview).style.background).toBe('');
  });

  it('the summary names the kind and what it keeps', () => {
    render(NewWorkspacePreview, { name: 'Journal', kindId: 'notes', translator });

    expect(screen.getByText('Notes - a notes folder, favourites and tabs')).toBeTruthy();
  });

  it('an empty name shows a placeholder next to the colour', () => {
    render(NewWorkspacePreview, { name: '   ', kindId: 'markdownViewer', colour: 'teal', translator });

    const preview = screen.getByRole('group', { name: 'Preview' });

    expect(within(preview).getByText('Untitled workspace')).toBeTruthy();
    expect(tileOf(preview).style.background).not.toBe('');
  });

  it('announces nothing', () => {
    render(NewWorkspacePreview, { name: 'Handbook', kindId: 'markdownViewer', translator });

    const preview = screen.getByRole('group', { name: 'Preview' });

    expect(preview.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(preview.getAttribute('aria-live')).toBeNull();
  });
});
