<script lang="ts">
  import type { ViewSettings } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { tick } from 'svelte';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import type { ContextMenuRequest } from '../../components/ContextMenuItem';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import { viewOptionMenus, type ViewOptionMenu, type ViewOptionMenuId } from './viewOptionMenus';

  interface Props {
    settings: ViewSettings;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { settings, translator, onCommand }: Props = $props();

  const menus = $derived(viewOptionMenus(settings, translator));

  let openMenu: { readonly id: ViewOptionMenuId; readonly position: ContextMenuRequest } | undefined =
    $state();
  let openerButton: HTMLButtonElement | undefined;
  let menuOpenWhenPressed: ViewOptionMenuId | undefined;
  const shownMenu = $derived(menus.find((menu) => menu.id === openMenu?.id));

  // Pressing the button of the open menu moves focus out of the menu, which closes it before the click.
  function rememberOpenMenu(event: PointerEvent, menuId: ViewOptionMenuId) {
    menuOpenWhenPressed = event.button === 0 && openMenu?.id === menuId ? menuId : undefined;
  }

  function toggleMenu(event: MouseEvent & { currentTarget: HTMLButtonElement }, menuId: ViewOptionMenuId) {
    const isPointerClick = event.detail > 0;
    const wasOpen = isPointerClick && menuOpenWhenPressed === menuId;
    menuOpenWhenPressed = undefined;
    if (wasOpen) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    openerButton = event.currentTarget;
    openMenu = { id: menuId, position: { x: bounds.left, y: bounds.bottom } };
  }

  function choose(menu: ViewOptionMenu, choiceId: string) {
    const command = menu.commandFor(choiceId);
    if (command) onCommand(command);
  }

  // Escape, Tab and a choice close the menu with focus still on an item; focus moving elsewhere stays where it went.
  async function closeMenu() {
    const isFocusInMenu = globalThis.document.activeElement?.closest('[role="menu"]') != null;
    openMenu = undefined;
    if (!isFocusInMenu) return;
    await tick();
    openerButton?.focus();
  }
</script>

<div class="view-options" role="group" aria-label={translator.translate('view.options.label')}>
  {#each menus as menu (menu.id)}
    <button
      type="button"
      title={menu.label}
      aria-haspopup="menu"
      aria-expanded={openMenu?.id === menu.id}
      onpointerdown={(event) => rememberOpenMenu(event, menu.id)}
      onclick={(event) => toggleMenu(event, menu.id)}
    >
      {menu.label}
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
    </button>
  {/each}
</div>
{#if openMenu && shownMenu}
  {@const menu = shownMenu}
  <ContextMenu
    label={menu.label}
    items={menu.items}
    position={openMenu.position}
    onChoose={(choiceId: string) => choose(menu, choiceId)}
    onClose={() => void closeMenu()}
  />
{/if}

<style>
  .view-options {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
    justify-content: flex-end;
  }

  button {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
    height: var(--island-button-size);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--island-button-radius);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-size-body);
    white-space: nowrap;
    transition:
      background-color var(--motion-fast) ease-out,
      color var(--motion-fast) ease-out;
  }

  button:hover,
  button[aria-expanded='true'] {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  @media (forced-colors: active) {
    button[aria-expanded='true'] {
      forced-color-adjust: none;
      background: Highlight;
      color: HighlightText;
    }
  }

  svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
