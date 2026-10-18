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
  style:left="{position.x}px"
  style:top="{position.y}px"
  onkeydown={handleKeydown}
  onfocusout={closeWhenFocusLeaves}
>
  {#each items as item (item.id)}
    {#if item.hasSeparatorBefore}
      <div class="separator" role="separator"></div>
    {/if}
    <button role="menuitem" tabindex="-1" disabled={item.isDisabled} onclick={() => choose(item.id)}>
      {item.label}
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
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  }

  button {
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

  .separator {
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--color-border);
  }
</style>
