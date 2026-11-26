<script lang="ts">
  import type { ViewSettings } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { tick } from 'svelte';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import type { ContextMenuRequest } from '../../components/ContextMenuItem';
  import { groupsThatFit, toolbarFocusAfter } from '../../components/toolbarKeyboard';
  import { shortcutLabelFor, tooltipWithShortcut } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import {
    DOCUMENT_BUTTON_COMMANDS,
    DOCUMENT_TOOLBAR_ISLANDS,
    isDocumentButton,
    moreOptionsItems,
    type DocumentToolbarActionId,
  } from './documentToolbarActions';
  import ViewOptions from './ViewOptions.svelte';
  import { viewOptionMenus, type ViewOptionMenuId } from './viewOptionMenus';

  /** Room kept for the More options island before it has been drawn and can be measured. */
  const MORE_ISLAND_WIDTH_PX = 42;

  interface Props {
    viewSettings: ViewSettings;
    hasDocument: boolean;
    canBeFavourite: boolean;
    isFavourite: boolean;
    isEditing: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { viewSettings, hasDocument, canBeFavourite, isFavourite, isEditing, translator, onCommand }: Props =
    $props();

  type ShownMenu =
    | { readonly kind: 'moreOptions'; readonly position: ContextMenuRequest }
    | { readonly kind: 'viewOption'; readonly id: ViewOptionMenuId; readonly position: ContextMenuRequest };

  const {
    open: openCommand,
    favourite: favouriteCommand,
    editing: editingCommand,
    previewBeside: previewBesideCommand,
  } = DOCUMENT_BUTTON_COMMANDS;

  const openLabel = $derived(translator.translate('toolbar.open'));
  const favouriteLabel = $derived(translator.translate('favourites.toggle'));
  const editingLabel = $derived(translator.translate(isEditing ? 'toolbar.preview' : 'toolbar.edit'));
  const previewBesideLabel = $derived(translator.translate('toolbar.previewBeside'));
  const moreLabel = $derived(translator.translate('toolbar.more'));

  let toolbar: HTMLElement | undefined = $state();
  let moreButton: HTMLButtonElement | undefined = $state();
  let shownIslandCount = $state(DOCUMENT_TOOLBAR_ISLANDS.length);
  let allIslandsWidthPx: number | undefined = $state();
  let menu: ShownMenu | undefined = $state();
  let lastFocusedButton: HTMLButtonElement | undefined;
  let wasMenuOpenWhenPressed = false;
  const islandWidths: number[] = [];

  const hiddenIslands = $derived(DOCUMENT_TOOLBAR_ISLANDS.slice(shownIslandCount));
  const moreItems = $derived(
    moreOptionsItems(
      hiddenIslands,
      { viewSettings, hasDocument, canBeFavourite, isFavourite, isEditing },
      translator,
    ),
  );
  const shownViewMenu = $derived.by(() => {
    const shown = menu;
    if (shown?.kind !== 'viewOption') return undefined;
    return viewOptionMenus(viewSettings, translator).find((viewMenu) => viewMenu.id === shown.id);
  });

  function isIslandShown(islandIndex: number): boolean {
    return islandIndex < shownIslandCount;
  }

  /** The toolbar's own buttons, not the items of a menu opened from it. */
  function toolbarButtons(): HTMLButtonElement[] {
    if (!toolbar) return [];
    return [...toolbar.querySelectorAll('button')].filter((button) => !button.closest('[role="menu"]'));
  }

  function keepOneTabStop() {
    const buttons = toolbarButtons();
    const enabled = buttons.filter((button) => !button.disabled);
    const tabStop = lastFocusedButton && enabled.includes(lastFocusedButton) ? lastFocusedButton : enabled[0];
    for (const button of buttons) button.tabIndex = button === tabStop ? 0 : -1;
  }

  function rememberFocus(event: FocusEvent) {
    if (!(event.target instanceof HTMLButtonElement) || !toolbarButtons().includes(event.target)) return;
    lastFocusedButton = event.target;
    keepOneTabStop();
  }

  function isAppShortcut(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.altKey || event.metaKey;
  }

  function moveFocus(event: KeyboardEvent) {
    if (event.isComposing || isAppShortcut(event) || !(event.target instanceof HTMLButtonElement)) return;
    const enabled = toolbarButtons().filter((button) => !button.disabled);
    const index = enabled.indexOf(event.target);
    if (index === -1 || !toolbar) return;
    const isRightToLeft = globalThis.getComputedStyle(toolbar).direction === 'rtl';
    const next = toolbarFocusAfter(event.key, { index, count: enabled.length, isRightToLeft });
    if (next === undefined) return;
    event.preventDefault();
    enabled[next]?.focus();
  }

  // Pressing More options while its menu is open moves focus out of the menu, which closes it before the click.
  function rememberMenuOpen(event: PointerEvent) {
    wasMenuOpenWhenPressed = event.button === 0 && menu !== undefined;
  }

  function toggleMoreOptions(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    const isPointerClick = event.detail > 0;
    const wasOpen = isPointerClick && wasMenuOpenWhenPressed;
    wasMenuOpenWhenPressed = false;
    if (wasOpen) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    menu = { kind: 'moreOptions', position: { x: bounds.left, y: bounds.bottom } };
  }

  function chooseMoreOption(actionId: DocumentToolbarActionId) {
    if (isDocumentButton(actionId)) onCommand(DOCUMENT_BUTTON_COMMANDS[actionId]);
    else if (menu) menu = { kind: 'viewOption', id: actionId, position: menu.position };
  }

  function chooseViewOption(choiceId: string) {
    const command = shownViewMenu?.commandFor(choiceId);
    if (command) onCommand(command);
  }

  // Focus returns to More options only if it was still in the menu; a swapped-in view option menu is not closed by the old one.
  async function closeMenu(closing: ShownMenu['kind']) {
    if (menu?.kind !== closing) return;
    const isFocusInMenu = globalThis.document.activeElement?.closest('[role="menu"]') != null;
    menu = undefined;
    if (!isFocusInMenu) return;
    await tick();
    const returnTarget = moreButton?.isConnected
      ? moreButton
      : toolbarButtons().find((button) => button.tabIndex === 0);
    returnTarget?.focus();
  }

  function measureIslands(element: HTMLElement) {
    const gapPx = Number.parseFloat(globalThis.getComputedStyle(element).columnGap) || 0;
    for (const island of element.querySelectorAll<HTMLElement>('[data-toolbar-island]')) {
      islandWidths[Number(island.dataset.toolbarIsland)] = island.getBoundingClientRect().width + gapPx;
    }
    const moreWidth =
      element.querySelector('[data-toolbar-more]')?.getBoundingClientRect().width ?? MORE_ISLAND_WIDTH_PX;
    allIslandsWidthPx = islandWidths.reduce((total, width) => total + width, 0);
    const fittingCount = groupsThatFit(islandWidths, element.clientWidth, moreWidth);
    if (fittingCount !== shownIslandCount && menu) void closeMenu(menu.kind);
    shownIslandCount = fittingCount;
  }

  const focusableButtonsKey = $derived([hasDocument, canBeFavourite, shownIslandCount].join());

  $effect(() => {
    if (focusableButtonsKey) keepOneTabStop();
  });

  /**
   * Islands at the end move into More options when the toolbar is narrower than all of them. The toolbar asks for
   * the width of every island, so the room it is given, not what it shows, decides when an island comes back.
   */
  $effect(() => {
    const element = toolbar;
    if (!element || typeof globalThis.ResizeObserver !== 'function') return;
    const observer = new globalThis.ResizeObserver(() => measureIslands(element));
    observer.observe(element);
    for (let islandIndex = 0; islandIndex < shownIslandCount; islandIndex += 1) {
      const island = element.querySelector(`[data-toolbar-island="${String(islandIndex)}"]`);
      if (island) observer.observe(island);
    }
    return () => observer.disconnect();
  });
</script>

<div
  class="toolbar"
  role="toolbar"
  tabindex="-1"
  aria-label={translator.translate('toolbar.label')}
  style:flex-basis={allIslandsWidthPx === undefined ? undefined : `${String(allIslandsWidthPx)}px`}
  bind:this={toolbar}
  onkeydown={moveFocus}
  onfocusin={rememberFocus}
>
  {#if isIslandShown(0)}
    <div class="island" data-toolbar-island="0">
      <button
        aria-label={openLabel}
        title={tooltipWithShortcut(openLabel, shortcutLabelFor(openCommand, translator))}
        onclick={() => onCommand(openCommand)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 18V6.5A1.5 1.5 0 0 1 5 5h4l2 2h6.5A1.5 1.5 0 0 1 19 8.5V10" />
          <path d="M3.5 18l2.6-6.9A1.5 1.5 0 0 1 7.5 10h13l-2.8 7.4a1 1 0 0 1-.9.6z" />
        </svg>
      </button>
      <button
        class="favourite"
        aria-label={favouriteLabel}
        aria-pressed={isFavourite}
        title={tooltipWithShortcut(favouriteLabel, shortcutLabelFor(favouriteCommand, translator))}
        disabled={!canBeFavourite}
        onclick={() => onCommand(favouriteCommand)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z" />
        </svg>
      </button>
    </div>
  {/if}
  {#if isIslandShown(1)}
    <div class="island" data-toolbar-island="1">
      <button
        class="labelled"
        aria-label={editingLabel}
        aria-pressed={isEditing}
        title={tooltipWithShortcut(editingLabel, shortcutLabelFor(editingCommand, translator))}
        disabled={!hasDocument}
        onclick={() => onCommand(editingCommand)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {#if isEditing}
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="2.75" />
          {:else}
            <path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7z" />
            <path d="M13.2 7l3.8 3.8" />
          {/if}
        </svg>
        <span aria-hidden="true">{editingLabel}</span>
      </button>
      <button
        aria-label={previewBesideLabel}
        aria-pressed={viewSettings.isPreviewBesideEditor}
        title={tooltipWithShortcut(previewBesideLabel, shortcutLabelFor(previewBesideCommand, translator))}
        disabled={!hasDocument}
        onclick={() => onCommand(previewBesideCommand)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="M12 5v14" />
        </svg>
      </button>
    </div>
  {/if}
  {#if isIslandShown(2)}
    <div class="island" data-toolbar-island="2">
      <ViewOptions settings={viewSettings} {translator} {onCommand} />
    </div>
  {/if}
  {#if hiddenIslands.length > 0}
    <div class="island" data-toolbar-more>
      <button
        bind:this={moreButton}
        aria-label={moreLabel}
        title={moreLabel}
        aria-haspopup="menu"
        aria-expanded={menu !== undefined}
        onpointerdown={rememberMenuOpen}
        onclick={toggleMoreOptions}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="12" r="1.25" />
          <circle cx="12" cy="12" r="1.25" />
          <circle cx="18" cy="12" r="1.25" />
        </svg>
      </button>
    </div>
  {/if}
</div>
{#if menu?.kind === 'moreOptions'}
  <ContextMenu
    label={moreLabel}
    items={moreItems}
    position={menu.position}
    onChoose={chooseMoreOption}
    onClose={() => void closeMenu('moreOptions')}
  />
{:else if menu && shownViewMenu}
  <ContextMenu
    label={shownViewMenu.label}
    items={shownViewMenu.items}
    position={menu.position}
    onChoose={chooseViewOption}
    onClose={() => void closeMenu('viewOption')}
  />
{/if}

<style>
  .toolbar {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    overflow: hidden;
  }

  .island {
    display: flex;
    flex: none;
    gap: 2px;
    align-items: center;
    padding: var(--island-padding);
    border: 1px solid var(--color-border);
    border-radius: var(--island-radius);
    background: var(--color-surface-raised);
  }

  button {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    justify-content: center;
    min-width: var(--island-button-size);
    height: var(--island-button-size);
    padding: 0 var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--island-button-radius);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-size-body);
    transition:
      background-color var(--motion-fast) ease-out,
      border-color var(--motion-fast) ease-out,
      color var(--motion-fast) ease-out;
  }

  button.labelled {
    padding-inline-end: var(--space-2);
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button[aria-pressed='true'] {
    border-color: var(--color-accent);
    background: var(--color-surface-selected);
    color: var(--color-accent);
  }

  button[aria-expanded='true'] {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:disabled {
    color: var(--color-text-tertiary);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  .favourite[aria-pressed='true'] {
    border-color: transparent;
    background: none;
  }

  .favourite[aria-pressed='true'] svg {
    fill: currentcolor;
  }

  svg {
    flex: none;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }

  @media (forced-colors: active) {
    button[aria-pressed='true'],
    button[aria-pressed='true']:hover:not(:disabled) {
      forced-color-adjust: none;
      border-color: Highlight;
      background: Highlight;
      color: HighlightText;
    }

    button[aria-pressed='true']:focus-visible {
      outline-color: HighlightText;
    }

    button[aria-pressed='true']:disabled {
      border-color: GrayText;
      background: Canvas;
      color: GrayText;
    }

    .favourite[aria-pressed='true']:not(:disabled) {
      border-color: Highlight;
      background: Highlight;
    }

    button[aria-expanded='true'] {
      forced-color-adjust: none;
      background: Highlight;
      color: HighlightText;
    }
  }
</style>
