<script lang="ts">
  import type { Tab } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';

  interface Props {
    tabs: readonly Tab[];
    activeKey: string | undefined;
    translator: Translator;
    onActivate: (canonicalKey: string) => void;
    onClose: (canonicalKey: string) => void;
  }

  const { tabs, activeKey, translator, onActivate, onClose }: Props = $props();

  const MIDDLE_MOUSE_BUTTON = 1;
  let tabButtons: HTMLButtonElement[] = $state([]);

  function focusTab(index: number) {
    const wrappedIndex = (index + tabs.length) % tabs.length;
    const tab = tabs[wrappedIndex];
    if (!tab) return;
    onActivate(tab.location.canonicalKey);
    tabButtons[wrappedIndex]?.focus();
  }

  function handleKeydown(event: KeyboardEvent, index: number) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: -1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusTab(target);
  }

  function handleAuxClick(event: MouseEvent, canonicalKey: string) {
    if (event.button === MIDDLE_MOUSE_BUTTON) onClose(canonicalKey);
  }
</script>

<div class="tab-strip" role="tablist" aria-label={translator.translate('tabs.label')}>
  {#each tabs as tab, index (tab.location.canonicalKey)}
    {@const isActive = tab.location.canonicalKey === activeKey}
    <div class="tab" class:active={isActive} class:pinned={tab.isPinned}>
      <button
        bind:this={tabButtons[index]}
        class="tab-label"
        role="tab"
        aria-selected={isActive}
        tabindex={isActive ? 0 : -1}
        title={tab.location.displayPath}
        onclick={() => onActivate(tab.location.canonicalKey)}
        onkeydown={(event) => handleKeydown(event, index)}
        onauxclick={(event) => handleAuxClick(event, tab.location.canonicalKey)}
      >
        {tab.location.fileName}
      </button>
      <button
        class="tab-close"
        tabindex="-1"
        aria-label={translator.translate('tabs.closeTab', { fileName: tab.location.fileName })}
        onclick={() => onClose(tab.location.canonicalKey)}
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .tab-strip {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2) 0;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    border-radius: var(--radius-medium) var(--radius-medium) 0 0;
    max-width: 220px;
  }

  .tab.active {
    background: var(--color-background);
    box-shadow: inset 0 2px 0 var(--color-accent);
  }

  .tab:not(.active):hover {
    background: var(--color-surface-hover);
  }

  .tab-label,
  .tab-close {
    border: 0;
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    cursor: default;
  }

  .tab-label {
    padding: var(--space-2) var(--space-1) var(--space-2) var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-close {
    padding: var(--space-1) var(--space-2);
    color: var(--color-text-secondary);
    border-radius: var(--radius-small);
  }

  .tab-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }
</style>
