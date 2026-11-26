import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentToolbar from './DocumentToolbar.svelte';

function renderToolbar({
  hasDocument = true,
  canBeFavourite = true,
  isFavourite = false,
  isEditing = false,
  viewSettings = DEFAULT_VIEW_SETTINGS,
} = {}) {
  const onCommand = vi.fn();
  const props = {
    viewSettings,
    hasDocument,
    canBeFavourite,
    isFavourite,
    isEditing,
    translator: createTranslator(),
    onCommand,
  };
  const { rerender } = render(DocumentToolbar, props);
  return { onCommand, rerender: (changes: Partial<typeof props>) => rerender({ ...props, ...changes }) };
}

interface ToolbarLayout {
  /** Gives the toolbar a new width, as a window resize would. */
  resizeToolbarTo: (newWidthPx: number) => Promise<void>;
  /** Widens one element without resizing the toolbar, as a longer button label would. */
  widenElement: (element: Element, extraWidthPx: number) => Promise<void>;
}

/**
 * Makes the toolbar this wide and each island 32 px per button, so the islands that do not fit move into More options.
 * Only the observers watching a resized element are told about it.
 */
function layOutToolbarAt(widthPx: number): ToolbarLayout {
  const watchedElementsByCallback = new Map<() => void, Set<Element>>();
  const extraWidthsPx = new WeakMap<Element, number>();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe(element: Element) {
        const watchedElements = watchedElementsByCallback.get(this.callback) ?? new Set<Element>();
        watchedElementsByCallback.set(this.callback, watchedElements.add(element));
        this.callback();
      }
      disconnect() {
        watchedElementsByCallback.delete(this.callback);
      }
    },
  );
  const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(widthPx);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const buttonsInside = this.querySelectorAll('button').length || 1;
    return new DOMRect(0, 0, buttonsInside * 32 + (extraWidthsPx.get(this) ?? 0), 32);
  });
  async function notifyWatchersOf(element: Element) {
    for (const [callback, watchedElements] of watchedElementsByCallback) {
      if (watchedElements.has(element)) callback();
    }
    await tick();
  }
  return {
    resizeToolbarTo: async (newWidthPx) => {
      clientWidth.mockReturnValue(newWidthPx);
      await notifyWatchersOf(screen.getByRole('toolbar'));
    },
    widenElement: async (element, extraWidthPx) => {
      extraWidthsPx.set(element, extraWidthPx);
      await notifyWatchersOf(element);
    },
  };
}

function toolbarButtons(): HTMLElement[] {
  return within(screen.getByRole('toolbar')).getAllByRole('button');
}

function menuItemLabels(menuName: string): string[] {
  const menu = screen.getByRole('menu', { name: menuName });
  return [...menu.querySelectorAll('[role^="menuitem"]')].map(
    (item) => item.firstElementChild?.textContent.trim() ?? '',
  );
}

function focusedElement(): Element | null {
  return globalThis.document.activeElement;
}

describe('DocumentToolbar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('names its icon buttons and mentions their shortcuts in the tooltip', () => {
    renderToolbar();

    const toolbar = screen.getByRole('toolbar', { name: 'Document actions' });
    expect(toolbar).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' }).title).toBe('Open (Ctrl+O)');
    expect(screen.getByRole('button', { name: 'Favourite' }).title).toMatch(/^Favourite \(.+\)$/);
    expect(screen.getByRole('button', { name: 'Side by Side' })).toBeTruthy();
  });

  it('opens documents, stars the document, switches to editing and shows the preview beside', async () => {
    const { onCommand } = renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Favourite' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Side by Side' }));

    expect(onCommand.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      { kind: 'openDocuments' },
      { kind: 'toggleFavourite' },
      { kind: 'toggleEditing' },
      { kind: 'togglePreviewBesideEditor' },
    ]);
  });

  it('shows which modes are on', () => {
    renderToolbar({
      isFavourite: true,
      isEditing: true,
      viewSettings: { ...DEFAULT_VIEW_SETTINGS, isPreviewBesideEditor: true },
    });

    expect(screen.getByRole('button', { name: 'Favourite' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Side by Side' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('disables the document actions while no document is shown', () => {
    renderToolbar({ hasDocument: false, canBeFavourite: false });

    expect(screen.getByRole('button', { name: 'Open' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Favourite' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Edit' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Side by Side' }).hasAttribute('disabled')).toBe(true);
  });

  it('includes the zoom and view options', () => {
    renderToolbar();

    expect(screen.getByRole('group', { name: 'View options' })).toBeTruthy();
  });

  it('the toolbar is one tab stop', async () => {
    renderToolbar();

    const tabStops = toolbarButtons().filter((button) => button.tabIndex === 0);
    await userEvent.tab();

    expect(tabStops).toEqual([screen.getByRole('button', { name: 'Open' })]);
    expect(focusedElement()).toBe(screen.getByRole('button', { name: 'Open' }));
  });

  it('one tab stop: shift+tab from the document reaches one button, right arrow moves on and tab leaves', async () => {
    renderToolbar();
    const documentButton = globalThis.document.createElement('button');
    documentButton.textContent = 'Document';
    globalThis.document.body.append(documentButton);
    documentButton.focus();

    await userEvent.tab({ shift: true });
    const reached = focusedElement();
    await userEvent.keyboard('{ArrowRight}');
    const afterArrow = focusedElement();
    await userEvent.tab();
    const afterTab = focusedElement();
    documentButton.remove();

    expect(reached).toBe(screen.getByRole('button', { name: 'Open' }));
    expect(afterArrow).toBe(screen.getByRole('button', { name: 'Favourite' }));
    expect(afterTab).toBe(documentButton);
  });

  it('arrow keys, home and end move between buttons', async () => {
    renderToolbar();
    screen.getByRole('button', { name: 'Open' }).focus();

    await userEvent.keyboard('{ArrowLeft}');
    const afterLeft = focusedElement();
    await userEvent.keyboard('{Home}');
    const afterHome = focusedElement();
    await userEvent.keyboard('{End}');

    expect(afterLeft).toBe(screen.getByRole('button', { name: 'Document Style' }));
    expect(afterHome).toBe(screen.getByRole('button', { name: 'Open' }));
    expect(focusedElement()).toBe(screen.getByRole('button', { name: 'Document Style' }));
  });

  it('leaves arrow keys with alt, ctrl or meta to the app shortcuts', () => {
    renderToolbar();
    const openButton = screen.getByRole('button', { name: 'Open' });
    openButton.focus();

    const presses = ['altKey', 'ctrlKey', 'metaKey'].map((modifier) => {
      const press = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      openButton.dispatchEvent(press);
      return press;
    });

    expect(presses.map((press) => press.defaultPrevented)).toEqual([false, false, false]);
    expect(focusedElement()).toBe(openButton);
  });

  it('skips disabled buttons when moving with the arrow keys', async () => {
    renderToolbar({ hasDocument: false, canBeFavourite: false });
    screen.getByRole('button', { name: 'Open' }).focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(focusedElement()).toBe(screen.getByRole('button', { name: 'Theme' }));
  });

  it('keeps the last focused button as its tab stop', async () => {
    renderToolbar();
    screen.getByRole('button', { name: 'Open' }).focus();

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');

    const tabStops = toolbarButtons().filter((button) => button.tabIndex === 0);
    expect(tabStops).toEqual([screen.getByRole('button', { name: 'Edit' })]);
  });

  it('moves the tab stop to the first usable button when the remembered one is disabled', async () => {
    const { rerender } = renderToolbar();
    screen.getByRole('button', { name: 'Open' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');

    await rerender({ hasDocument: false, canBeFavourite: false });

    const tabStops = toolbarButtons().filter((button) => button.tabIndex === 0);
    expect(tabStops).toEqual([screen.getByRole('button', { name: 'Open' })]);
  });

  it('moves the tab stop to the first button when the remembered one moves into more options', async () => {
    const { resizeToolbarTo } = layOutToolbarAt(1000);
    renderToolbar();
    screen.getByRole('button', { name: 'Open' }).focus();
    await userEvent.keyboard('{End}');

    await resizeToolbarTo(120);

    const tabStops = toolbarButtons().filter((button) => button.tabIndex === 0);
    expect(tabStops).toEqual([screen.getByRole('button', { name: 'Open' })]);
  });

  it('every button has an accessible name with every island shown', () => {
    renderToolbar();

    const unnamed = toolbarButtons().filter(
      (button) => !button.getAttribute('aria-label') && !button.textContent.trim(),
    );

    expect(toolbarButtons().length).toBeGreaterThan(5);
    expect(unnamed).toEqual([]);
  });

  it('every button has an accessible name while islands are under more options', () => {
    layOutToolbarAt(120);
    renderToolbar();

    const unnamed = toolbarButtons().filter(
      (button) => !button.getAttribute('aria-label') && !button.textContent.trim(),
    );

    expect(toolbarButtons().length).toBeGreaterThan(1);
    expect(unnamed).toEqual([]);
  });

  it('brings islands back from more options once the toolbar has room again', async () => {
    const { resizeToolbarTo } = layOutToolbarAt(120);
    renderToolbar();

    await resizeToolbarTo(1000);

    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
    expect(screen.getByRole('group', { name: 'View options' })).toBeTruthy();
  });

  it('asks for the width of all seven buttons even while some are under more options', () => {
    layOutToolbarAt(120);
    renderToolbar();

    expect(screen.getByRole('toolbar').style.flexBasis).toBe('224px');
  });

  it('measures an island again when only its own width changes', async () => {
    const { widenElement } = layOutToolbarAt(1000);
    renderToolbar();
    const editIsland = screen.getByRole('button', { name: 'Edit' }).closest('[data-toolbar-island]');
    expect(editIsland).not.toBeNull();

    if (editIsland) await widenElement(editIsland, 100);

    expect(screen.getByRole('toolbar').style.flexBasis).toBe('324px');
  });

  it('closes more options when the islands under it change', async () => {
    const { resizeToolbarTo } = layOutToolbarAt(120);
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));

    await resizeToolbarTo(180);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes a view option menu opened from more options when the islands change', async () => {
    const { resizeToolbarTo } = layOutToolbarAt(120);
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Theme/ }));
    expect(screen.getByRole('menu')).toBeTruthy();

    await resizeToolbarTo(1000);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus to the first button when more options goes away with its menu open', async () => {
    const { resizeToolbarTo } = layOutToolbarAt(120);
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(focusedElement()?.closest('[role="menu"]')).not.toBeNull();

    await resizeToolbarTo(1000);
    await tick();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(focusedElement()).toBe(screen.getByRole('button', { name: 'Open' }));
  });

  it('buttons overflow into more options in a fixed order', async () => {
    layOutToolbarAt(120);
    renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(menuItemLabels('More options')).toEqual([
      'Edit',
      'Side by Side',
      'Theme',
      'Text Width',
      'Document Style',
    ]);
  });

  it('narrow window: the view options are listed under more options and the rest stay in the toolbar', async () => {
    layOutToolbarAt(180);
    renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.queryByRole('group', { name: 'View options' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(menuItemLabels('More options')).toEqual(['Theme', 'Text Width', 'Document Style']);
  });

  it('shows no more options button when every island fits', () => {
    layOutToolbarAt(1000);
    renderToolbar();

    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('more options runs the command of a hidden button and returns focus to its button', async () => {
    layOutToolbarAt(120);
    const { onCommand } = renderToolbar();
    const moreButton = screen.getByRole('button', { name: 'More options' });

    await userEvent.click(moreButton);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'toggleEditing' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(focusedElement()).toBe(moreButton);
  });

  it('more options shows the state of hidden buttons and which cannot be used', async () => {
    layOutToolbarAt(120);
    renderToolbar({
      hasDocument: false,
      viewSettings: { ...DEFAULT_VIEW_SETTINGS, isPreviewBesideEditor: true },
    });

    await userEvent.click(screen.getByRole('button', { name: 'More options' }));

    const sideBySide = screen.getByRole('menuitemcheckbox', { name: 'Side by Side' });
    expect(sideBySide.getAttribute('aria-checked')).toBe('true');
    expect(sideBySide.hasAttribute('disabled')).toBe(true);
  });

  it('more options opens the menu of a hidden view option', async () => {
    layOutToolbarAt(120);
    const { onCommand } = renderToolbar();
    const moreButton = screen.getByRole('button', { name: 'More options' });

    await userEvent.click(moreButton);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Theme' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Dark' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setTheme', theme: 'dark' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(focusedElement()).toBe(moreButton);
  });

  it('closes more options when its button is pressed again', async () => {
    layOutToolbarAt(120);
    renderToolbar();
    const moreButton = screen.getByRole('button', { name: 'More options' });

    await userEvent.click(moreButton);
    await userEvent.click(moreButton);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(moreButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('returns focus to more options when its menu is closed with escape', async () => {
    layOutToolbarAt(120);
    renderToolbar();
    const moreButton = screen.getByRole('button', { name: 'More options' });

    await userEvent.click(moreButton);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(focusedElement()).toBe(moreButton);
  });
});
