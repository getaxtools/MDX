import { TabStrip } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TabStripView from './TabStripView.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

function renderTabs(...paths: string[]) {
  const tabStrip = paths.reduce((strip, path) => strip.openOrFocus(location(path)), TabStrip.empty());
  const onActivate = vi.fn();
  const onClose = vi.fn();
  render(TabStripView, {
    tabs: tabStrip.tabs(),
    activeKey: tabStrip.activeTab()?.location.canonicalKey,
    translator: createTranslator(),
    onActivate,
    onClose,
  });
  return { onActivate, onClose };
}

describe('TabStripView', () => {
  it('shows each document as a tab and marks the active one', () => {
    renderTabs('Guide.md', 'Notes.md');

    const tabs = screen.getAllByRole('tab');

    expect(tabs.map((tab) => tab.textContent.trim())).toEqual(['Guide.md', 'Notes.md']);
    expect(screen.getByRole('tab', { selected: true }).textContent.trim()).toBe('Notes.md');
    expect(screen.getByRole('tablist', { name: 'Open documents' })).toBeTruthy();
  });

  it('activates a tab when clicked', async () => {
    const { onActivate } = renderTabs('Guide.md', 'Notes.md');

    await userEvent.click(screen.getByRole('tab', { name: 'Guide.md' }));

    expect(onActivate).toHaveBeenCalledWith(location('Guide.md').canonicalKey);
  });

  it('closes a tab with its close button', async () => {
    const { onClose } = renderTabs('Guide.md');

    await userEvent.click(screen.getByRole('button', { name: 'Close Guide.md' }));

    expect(onClose).toHaveBeenCalledWith(location('Guide.md').canonicalKey);
  });

  it('moves between tabs with the arrow keys, wrapping around', async () => {
    const { onActivate } = renderTabs('Guide.md', 'Notes.md');
    screen.getByRole('tab', { name: 'Notes.md' }).focus();

    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Home}');

    expect(onActivate).toHaveBeenNthCalledWith(1, location('Guide.md').canonicalKey);
    expect(onActivate).toHaveBeenNthCalledWith(2, location('Guide.md').canonicalKey);
  });

  it('closes a tab with a middle click', async () => {
    const { onClose } = renderTabs('Guide.md');

    await userEvent.pointer({ keys: '[MouseMiddle]', target: screen.getByRole('tab', { name: 'Guide.md' }) });

    expect(onClose).toHaveBeenCalledWith(location('Guide.md').canonicalKey);
  });

  it('keeps only the active tab in the keyboard tab order', () => {
    renderTabs('Guide.md', 'Notes.md');

    expect(screen.getByRole('tab', { name: 'Notes.md' }).tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Guide.md' }).tabIndex).toBe(-1);
  });
});
