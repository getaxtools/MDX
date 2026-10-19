<script lang="ts" generics="ItemId extends string">
  import type { ContextMenuItem } from './ContextMenuItem';

  interface Props {
    label: string;
    items: readonly ContextMenuItem<ItemId>[];
    position: { readonly x: number; readonly y: number };
    onChoose: (itemId: ItemId) => void;
    onClose: () => void;
  }

  const { label, items, position, onChoose, onClose }: Props = $props();

  let menuElement: HTMLDivElement | undefined = $state();
  const enabledButtons = () => [
    ...(menuElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ];

  $effect(() => enabledButtons()[0]?.focus());

  let shownPosition = $state({ x: 0, y: 0 });

  // A menu opened near the bottom or right edge, such as from the status bar, opens upwards or leftwards.
  $effect(() => {
    const bounds = menuElement?.getBoundingClientRect();
    const width = bounds?.width ?? 0;
    const height = bounds?.height ?? 0;
    shownPosition = {
      x: Math.max(0, Math.min(position.x, globalThis.innerWidth - width)),
      y: Math.max(0, Math.min(position.y, globalThis.innerHeight - height)),
    };
  });

  const MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
    ArrowDown: (index, count) => (index + 1) % count,
    ArrowUp: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_index, count) => count - 1,
  };

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
      return;
    }
    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    const buttons = enabledButtons();
    const currentIndex = buttons.findIndex((button) => button === globalThis.document.activeElement);
    buttons[move(currentIndex, buttons.length)]?.focus();
  }

  function choose(itemId: ItemId) {
    onChoose(itemId);
    onClose();
  }

  function closeWhenFocusLeaves(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node) || !menuElement?.contains(event.relatedTarget)) onClose();
  }
</script>

<div
  bind:this={menuElement}
  class="context-menu"
  role="menu"
  aria-label={label}
  tabindex="-1"
  style:left="{shownPosition.x}px"
  style:top="{shownPosition.y}px"
  onkeydown={handleKeydown}
  onfocusout={closeWhenFocusLeaves}
>
  {#each items as item (item.id)}
    {#if item.hasSeparatorBefore}
      <div class="separator" role="separator"></div>
    {/if}
    <button role="menuitem" tabindex="-1" disabled={item.isDisabled} onclick={() => choose(item.id)}>
      <span>{item.label}</span>
      {#if item.shortcut}
        <span class="shortcut" aria-hidden="true">{item.shortcut}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    max-height: calc(100vh - 2 * var(--space-2));
    overflow-y: auto;
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  }

  button {
    display: flex;
    gap: var(--space-6);
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    text-align: start;
  }

  button:is(:hover, :focus):not(:disabled) {
    background: var(--color-surface-selected);
    outline: none;
  }

  button:disabled {
    color: var(--color-text-secondary);
  }

  .shortcut {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    white-space: nowrap;
  }

  .separator {
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--color-border);
  }
</style>
