import { TabStrip } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles, type PathStatus } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TabStripView from './TabStripView.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

function renderTabs(...paths: string[]) {
  const tabStrip = paths.reduce((strip, path) => strip.openOrFocus(location(path)), TabStrip.empty());
  const onActivate = vi.fn();
  const onCommand = vi.fn();
  render(TabStripView, {
    tabs: tabStrip.tabs(),
    activeKey: tabStrip.activeTab()?.location.canonicalKey,
    translator: createTranslator(),
    onActivate,
    onCommand,
  });
  return { onActivate, onCommand };
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
    const { onCommand } = renderTabs('Guide.md');

    await userEvent.click(screen.getByTitle('Close Guide.md'));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'closeTab',
      canonicalKey: location('Guide.md').canonicalKey,
    });
  });

  it('keeps close buttons out of the tab list so assistive technology sees only tabs', () => {
    renderTabs('Guide.md', 'Notes.md');

    const tabList = screen.getByRole('tablist', { name: 'Open documents' });

    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(tabList.querySelectorAll('[role="tab"]')).toHaveLength(2);
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
    const { onCommand } = renderTabs('Guide.md');

    await userEvent.pointer({ keys: '[MouseMiddle]', target: screen.getByRole('tab', { name: 'Guide.md' }) });

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'closeTab',
      canonicalKey: location('Guide.md').canonicalKey,
    });
  });

  it('marks a tab whose file no longer exists', () => {
    render(TabStripView, {
      tabs: TabStrip.empty().openOrFocus(location('Guide.md')).tabs(),
      activeKey: undefined,
      pathStatuses: new Map<string, PathStatus>([[location('Guide.md').canonicalKey, 'missing']]),
      translator: createTranslator(),
      onActivate: vi.fn(),
      onCommand: vi.fn(),
    });

    expect(screen.getByRole('tab', { name: 'Guide.md (file not found)' })).toBeTruthy();
  });

  it('keeps only the active tab in the keyboard tab order', () => {
    renderTabs('Guide.md', 'Notes.md');

    expect(screen.getByRole('tab', { name: 'Notes.md' }).tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Guide.md' }).tabIndex).toBe(-1);
  });

  it('moves a tab by dragging it onto another tab', async () => {
    const { onCommand } = renderTabs('Guide.md', 'Notes.md', 'Plan.md');

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: screen.getByRole('tab', { name: 'Plan.md' }) },
      { target: screen.getByRole('tab', { name: 'Guide.md' }) },
      { keys: '[/MouseLeft]' },
    ]);

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moveTab',
      canonicalKey: location('Plan.md').canonicalKey,
      toIndex: 0,
    });
  });

  it('opens a context menu on right-click and runs the chosen action for that tab', async () => {
    const { onCommand } = renderTabs('Guide.md', 'Notes.md');

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByRole('tab', { name: 'Guide.md' }) });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin Tab' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'pinTab',
      canonicalKey: location('Guide.md').canonicalKey,
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the context menu with Shift+F10 and returns focus to the tab on Escape', async () => {
    renderTabs('Guide.md');
    screen.getByRole('tab', { name: 'Guide.md' }).focus();

    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menu', { name: 'Actions for Guide.md' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Guide.md' }));
  });
});
