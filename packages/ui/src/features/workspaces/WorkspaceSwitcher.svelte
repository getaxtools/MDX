<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { highlightSegments } from '../command-palette/highlightSegments';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import { CHECK_ICON } from '../control-wheel/kindPresentation';
  import { scrollIntoViewWhen } from '../folder-tree/scrollIntoViewWhen';
  import { switcherGroups, type SwitcherEntry, type SwitcherSource } from './switcherGroups';
  import { colourValueOf } from './workspacePresentation';

  interface Props {
    source: SwitcherSource;
    translator: Translator;
    onSwitch: (workspaceId: string) => void;
    onClose: () => void;
  }

  const { source, translator, onSwitch, onClose }: Props = $props();

  let filter = $state('');
  let activeIndex = $state(0);
  let switcher: HTMLDivElement | undefined = $state();

  const groups = $derived(switcherGroups(source, filter, translator));
  const entries: readonly SwitcherEntry[] = $derived(groups.flatMap((group) => group.entries));

  function choose(entry: SwitcherEntry | undefined) {
    if (!entry) return;
    onClose();
    if (!entry.isShown) onSwitch(entry.workspace.id);
  }

  function moveActive(step: 1 | -1) {
    if (entries.length === 0) return;
    activeIndex = (activeIndex + step + entries.length) % entries.length;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') moveActive(1);
    else if (event.key === 'ArrowUp') moveActive(-1);
    else if (event.key === 'Enter') choose(entries[activeIndex]);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** Closes when focus moves to another part of the window, but not when the whole window loses focus. */
  function closeWhenFocusMovesAway(event: FocusEvent) {
    const destination = event.relatedTarget;
    if (destination instanceof Node && !switcher?.contains(destination)) onClose();
  }

  function closeWhenPressedOutside(event: PointerEvent) {
    if (event.target instanceof Node && !switcher?.contains(event.target)) onClose();
  }

  function optionId(index: number): string {
    return `workspace-option-${String(index)}`;
  }

  /** The name comes first, as on screen; the kind and whether it is shown are only read out. */
  function accessibleNameOf(entry: SwitcherEntry, kindName: string): string {
    const values = { name: entry.name, kind: kindName };
    return translator.translate(
      entry.isShown ? 'workspaces.switcher.optionShown' : 'workspaces.switcher.option',
      values,
    );
  }

  function focusOnMount(input: HTMLInputElement) {
    input.focus();
  }
</script>

<svelte:window onpointerdown={closeWhenPressedOutside} />

<div
  class="switcher"
  role="dialog"
  aria-modal="true"
  aria-label={translator.translate('workspaces.switcher.label')}
  bind:this={switcher}
  onfocusout={closeWhenFocusMovesAway}
>
  <input
    role="combobox"
    aria-expanded="true"
    aria-controls="workspace-options"
    aria-autocomplete="list"
    aria-activedescendant={entries.length > 0 ? optionId(activeIndex) : undefined}
    aria-label={translator.translate('workspaces.switcher.filter')}
    placeholder={translator.translate('workspaces.switcher.placeholder')}
    spellcheck="false"
    autocomplete="off"
    bind:value={filter}
    use:focusOnMount
    oninput={() => (activeIndex = 0)}
    onkeydown={handleKeydown}
  />
  <div id="workspace-options" role="listbox" aria-label={translator.translate('workspaces.switcher.label')}>
    {#each groups as group (group.kindId)}
      <div role="group" aria-labelledby="workspace-group-{group.kindId}">
        <div id="workspace-group-{group.kindId}" class="group-name" role="presentation">{group.kindName}</div>
        {#each group.entries as entry (entry.workspace.id)}
          {@const index = entries.indexOf(entry)}
          <div
            id={optionId(index)}
            role="option"
            tabindex="-1"
            aria-selected={index === activeIndex}
            aria-label={accessibleNameOf(entry, group.kindName)}
            class="option"
            class:active={index === activeIndex}
            use:scrollIntoViewWhen={index === activeIndex}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => choose(entry)}
            onkeydown={handleKeydown}
          >
            {#if colourValueOf(entry.workspace.colour)}
              <span class="swatch" style:background={colourValueOf(entry.workspace.colour)}></span>
            {/if}
            <span class="name">
              {#each highlightSegments(entry.name, entry.matchedIndexes) as segment, segmentIndex (segmentIndex)}
                {#if segment.isMatch}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
              {/each}
            </span>
            {#if entry.isShown}
              <span class="shown"><KindIcon paths={CHECK_ICON} /></span>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if entries.length === 0}
    <p class="empty" role="status">{translator.translate('workspaces.switcher.noMatches')}</p>
  {/if}
</div>

<style>
  .switcher {
    animation: fade-in var(--motion-fast) var(--easing-standard);
    position: fixed;
    inset-block-start: min(96px, 12vh);
    inset-inline-start: 50%;
    z-index: 30;
    display: flex;
    flex-direction: column;
    width: min(32rem, calc(100vw - 2rem));
    max-height: 60vh;
    padding: var(--space-2);
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-large);
    background: var(--color-surface-raised);
    color: var(--color-text);
    box-shadow: var(--shadow-medium);
    transform: translateX(-50%);
  }

  .switcher:dir(rtl) {
    transform: translateX(50%);
  }

  input {
    flex: none;
    height: 40px;
    margin-block-end: var(--space-2);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-focus);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-reading);
  }

  input:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -1px;
  }

  input::placeholder {
    color: var(--color-text-tertiary);
  }

  [role='listbox'] {
    overflow-y: auto;
  }

  .group-name {
    padding: var(--space-2) var(--space-3) var(--space-1);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  .option {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: 6px var(--space-3);
    border-radius: var(--radius-medium);
    cursor: default;
  }

  .option.active {
    background: var(--color-surface-selected);
  }

  .swatch {
    flex: none;
    align-self: center;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
  }

  mark {
    background: none;
    color: var(--color-accent);
    font-weight: 700;
  }

  .shown {
    display: flex;
    margin-inline-start: auto;
    color: var(--color-accent);
  }

  .shown :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .empty {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--color-text-secondary);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
</style>
