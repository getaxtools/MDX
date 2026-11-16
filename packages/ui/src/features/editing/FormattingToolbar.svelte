<script lang="ts">
  import type { EditingModeSetting } from '@mdx/core';
  import type { FormattingState, ToolboxAction } from '@mdx/editor';
  import type { Translator } from '@mdx/i18n';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import type { ContextMenuItem, ContextMenuRequest } from '../../components/ContextMenuItem';
  import { groupsThatFit, toolbarFocusAfter } from './toolbarKeyboard';
  import { TOOLBOX_ICONS } from './toolboxIcons';
  import {
    TOOLBOX_GROUPS,
    ariaShortcutOf,
    headingMenuItems,
    headingMenuLabel,
    isPressable,
    isPressed,
    mathMenuItems,
    overflowMenuItems,
    tooltipOf,
    type ToolboxControl,
  } from './toolboxItems';

  type MenuChoice = ToolboxAction | 'richText';

  /** Room kept for More formatting before it has been drawn and can be measured. */
  const MORE_BUTTON_WIDTH_PX = 32;

  interface Props {
    formatting: FormattingState | undefined;
    editingMode: EditingModeSetting;
    translator: Translator;
    /** Runs a control's command on the editor's selection. */
    onRun: (action: ToolboxAction) => void;
    onToggleEditingMode: () => void;
    /** Escape, and closing a menu opened with the pointer, return to the editor at its selection. */
    onReturnToEditor: () => void;
  }

  const { formatting, editingMode, translator, onRun, onToggleEditingMode, onReturnToEditor }: Props =
    $props();

  let toolbar: HTMLElement | undefined = $state();
  let focusIndex = $state(0);
  let shownGroupCount = $state(TOOLBOX_GROUPS.length);
  let menu:
    | {
        items: ContextMenuItem<MenuChoice>[];
        position: ContextMenuRequest;
        isFromKeyboard: boolean;
        opener: HTMLElement;
      }
    | undefined = $state();
  const groupWidths: number[] = [];

  const shownGroups = $derived(TOOLBOX_GROUPS.slice(0, shownGroupCount));
  const hiddenGroups = $derived(TOOLBOX_GROUPS.slice(shownGroupCount));

  function controls(): HTMLElement[] {
    return toolbar ? [...toolbar.querySelectorAll<HTMLElement>('[data-toolbox-control]')] : [];
  }

  function moveFocus(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onReturnToEditor();
      return;
    }
    const all = controls();
    const index = event.target instanceof HTMLElement ? all.indexOf(event.target) : -1;
    const isRightToLeft = toolbar ? globalThis.getComputedStyle(toolbar).direction === 'rtl' : false;
    const next = toolbarFocusAfter(event.key, {
      index: Math.max(index, 0),
      count: all.length,
      isRightToLeft,
    });
    if (next === undefined) return;
    event.preventDefault();
    focusIndex = next;
    all[next]?.focus();
  }

  /** A pointer press must not take the focus or the selection from the editor. */
  function keepEditorFocus(event: MouseEvent) {
    event.preventDefault();
  }

  function openMenu(event: MouseEvent | KeyboardEvent, items: ContextMenuItem<MenuChoice>[]) {
    const opener = event.currentTarget;
    if (!(opener instanceof HTMLElement)) return;
    const bounds = opener.getBoundingClientRect();
    menu = {
      items,
      position: { x: bounds.left, y: bounds.bottom },
      isFromKeyboard: event.detail === 0,
      opener,
    };
  }

  function openMenuWithDown(event: KeyboardEvent, items: ContextMenuItem<MenuChoice>[]) {
    if (event.key !== 'ArrowDown' || event.isComposing) return;
    event.preventDefault();
    openMenu(event, items);
  }

  function choose(choice: MenuChoice) {
    const opened = menu;
    menu = undefined;
    if (choice === 'richText') onToggleEditingMode();
    else onRun(choice);
    if (opened?.isFromKeyboard) opened.opener.focus();
    else onReturnToEditor();
  }

  function closeMenu() {
    const opened = menu;
    menu = undefined;
    if (opened?.isFromKeyboard) opened.opener.focus();
    else onReturnToEditor();
  }

  function labelOf(control: ToolboxControl): string {
    if (control.kind === 'button') return translator.translate(control.labelKey);
    if (control.kind === 'headingMenu') return headingMenuLabel(formatting, translator);
    return translator.translate(
      control.kind === 'mathMenu' ? 'editor.toolbox.math' : 'editor.toolbox.richText',
    );
  }

  function iconOf(control: ToolboxControl): readonly string[] {
    if (control.kind === 'button') return TOOLBOX_ICONS[control.action] ?? [];
    if (control.kind === 'headingMenu') return TOOLBOX_ICONS.heading ?? [];
    return (control.kind === 'mathMenu' ? TOOLBOX_ICONS.math : TOOLBOX_ICONS.richText) ?? [];
  }

  /** Groups move into More formatting from the right when the toolbar is narrower than all of them. */
  $effect(() => {
    const element = toolbar;
    if (!element || typeof globalThis.ResizeObserver !== 'function') return;
    const observer = new globalThis.ResizeObserver(() => {
      for (const group of element.querySelectorAll<HTMLElement>('[data-toolbox-group]')) {
        groupWidths[Number(group.dataset.toolboxGroup)] = group.getBoundingClientRect().width;
      }
      const moreWidth =
        element.querySelector('[data-toolbox-more]')?.getBoundingClientRect().width ?? MORE_BUTTON_WIDTH_PX;
      shownGroupCount = groupsThatFit(groupWidths, element.clientWidth, moreWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div
  class="formatting-toolbar"
  role="toolbar"
  tabindex="-1"
  aria-label={translator.translate('editor.toolbox.label')}
  bind:this={toolbar}
  onkeydown={moveFocus}
>
  {#each shownGroups as group, groupIndex (groupIndex)}
    <div class="toolbox-group" data-toolbox-group={groupIndex}>
      {#each group as control (control)}
        {@const index = shownGroups.slice(0, groupIndex).flat().length + group.indexOf(control)}
        {#if control.kind === 'button'}
          <button
            data-toolbox-control
            tabindex={index === focusIndex ? 0 : -1}
            aria-label={labelOf(control)}
            title={tooltipOf(control.action, translator, control.labelKey)}
            aria-keyshortcuts={ariaShortcutOf(control.action)}
            aria-pressed={isPressable(control.action) ? isPressed(control.action, formatting) : undefined}
            onmousedown={keepEditorFocus}
            onfocus={() => (focusIndex = index)}
            onclick={() => onRun(control.action)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#each iconOf(control) as path (path)}<path d={path} />{/each}
            </svg>
          </button>
        {:else if control.kind === 'richText'}
          <button
            data-toolbox-control
            tabindex={index === focusIndex ? 0 : -1}
            aria-label={labelOf(control)}
            title={labelOf(control)}
            aria-pressed={editingMode === 'richText'}
            onmousedown={keepEditorFocus}
            onfocus={() => (focusIndex = index)}
            onclick={onToggleEditingMode}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#each iconOf(control) as path (path)}<path d={path} />{/each}
            </svg>
          </button>
        {:else}
          {@const items =
            control.kind === 'headingMenu' ? headingMenuItems(translator) : mathMenuItems(translator)}
          <button
            data-toolbox-control
            tabindex={index === focusIndex ? 0 : -1}
            aria-label={labelOf(control)}
            title={labelOf(control)}
            aria-haspopup="menu"
            aria-expanded={menu?.items === items}
            onmousedown={keepEditorFocus}
            onfocus={() => (focusIndex = index)}
            onclick={(event: MouseEvent) => openMenu(event, items)}
            onkeydown={(event: KeyboardEvent) => openMenuWithDown(event, items)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#each iconOf(control) as path (path)}<path d={path} />{/each}
            </svg>
          </button>
        {/if}
      {/each}
    </div>
  {/each}
  {#if hiddenGroups.length > 0}
    {@const moreLabel = translator.translate('editor.toolbox.more')}
    <button
      data-toolbox-control
      data-toolbox-more
      tabindex={shownGroups.flat().length === focusIndex ? 0 : -1}
      aria-label={moreLabel}
      title={moreLabel}
      aria-haspopup="menu"
      onmousedown={keepEditorFocus}
      onfocus={() => (focusIndex = shownGroups.flat().length)}
      onclick={(event: MouseEvent) => openMenu(event, overflowMenuItems(hiddenGroups, translator))}
      onkeydown={(event: KeyboardEvent) =>
        openMenuWithDown(event, overflowMenuItems(hiddenGroups, translator))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#each TOOLBOX_ICONS.more ?? [] as path (path)}<path d={path} />{/each}
      </svg>
    </button>
  {/if}
</div>

{#if menu}
  <ContextMenu
    label={translator.translate('editor.toolbox.label')}
    items={menu.items}
    position={menu.position}
    onChoose={choose}
    onClose={closeMenu}
  />
{/if}

<style>
  .formatting-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    overflow: hidden;
    padding-inline: var(--space-2);
  }

  .toolbox-group {
    display: flex;
    flex: none;
    gap: var(--space-1);
  }

  .toolbox-group + .toolbox-group {
    padding-inline-start: var(--space-2);
    border-inline-start: 1px solid var(--color-border);
  }

  button {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
  }

  button:hover {
    background: var(--color-surface-selected);
  }

  button[aria-pressed='true'] {
    border-color: var(--color-border-strong);
    background: var(--color-surface-selected);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (forced-colors: active) {
    button[aria-pressed='true'] {
      border-color: Highlight;
    }
  }
</style>
