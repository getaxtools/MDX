<script lang="ts">
  import { rankByFuzzyMatch } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { DocumentLocation } from '@mdx/platform';
  import { scrollIntoViewWhen } from '../folder-tree/scrollIntoViewWhen';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import { highlightSegments } from './highlightSegments';
  import type { PaletteCommand } from './paletteCommands';

  interface Props {
    translator: Translator;
    commands: readonly PaletteCommand[];
    loadDocuments: () => Promise<readonly DocumentLocation[]>;
    onRunCommand: (command: ViewerCommand) => void;
    onOpenDocument: (documentPath: string) => void;
    onClose: () => void;
  }

  const { translator, commands, loadDocuments, onRunCommand, onOpenDocument, onClose }: Props = $props();

  interface PaletteResult {
    readonly id: string;
    readonly label: string;
    readonly matchedIndexes: readonly number[];
    readonly detail?: string;
    readonly shortcut?: string;
    readonly choose: () => void;
  }

  const COMMAND_PREFIX = '>';
  const MAX_RESULTS = 50;

  let query = $state('');
  let activeIndex = $state(0);
  let documents: readonly DocumentLocation[] | undefined = $state();

  const isCommandSearch = $derived(query.startsWith(COMMAND_PREFIX));
  const searchText = $derived((isCommandSearch ? query.slice(COMMAND_PREFIX.length) : query).trim());
  const results: readonly PaletteResult[] = $derived(
    isCommandSearch ? commandResults(searchText) : documentResults(searchText),
  );
  const emptyMessage = $derived.by(() => {
    if (isCommandSearch) return translator.translate('palette.noCommands');
    return translator.translate(documents === undefined ? 'palette.searching' : 'palette.noDocuments');
  });

  $effect(() => {
    void loadDocuments().then((loaded) => (documents = loaded));
  });

  function commandResults(text: string): PaletteResult[] {
    return rankByFuzzyMatch(commands, text, (command) => command.label)
      .slice(0, MAX_RESULTS)
      .map(({ item, match }, index) => ({
        id: `command-${String(index)}`,
        label: item.label,
        matchedIndexes: match.matchedIndexes,
        ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
        choose: () => onRunCommand(item.command),
      }));
  }

  function documentResults(text: string): PaletteResult[] {
    return rankByFuzzyMatch(documents ?? [], text, (document) => document.fileName)
      .slice(0, MAX_RESULTS)
      .map(({ item, match }) => ({
        id: item.canonicalKey,
        label: item.fileName,
        matchedIndexes: match.matchedIndexes,
        detail: item.displayPath,
        choose: () => onOpenDocument(item.displayPath),
      }));
  }

  function choose(result: PaletteResult | undefined) {
    if (!result) return;
    onClose();
    result.choose();
  }

  function moveActive(step: 1 | -1) {
    if (results.length === 0) return;
    activeIndex = (activeIndex + step + results.length) % results.length;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') moveActive(1);
    else if (event.key === 'ArrowUp') moveActive(-1);
    else if (event.key === 'Enter') choose(results[activeIndex]);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  let palette: HTMLDivElement | undefined = $state();

  /** Closes when focus moves to another part of the window, but not when the whole window loses focus. */
  function closeWhenFocusMovesAway(event: FocusEvent) {
    const destination = event.relatedTarget;
    if (destination instanceof Node && !palette?.contains(destination)) onClose();
  }

  function closeWhenPressedOutside(event: PointerEvent) {
    if (event.target instanceof Node && !palette?.contains(event.target)) onClose();
  }

  function optionId(index: number): string {
    return `palette-option-${String(index)}`;
  }

  function focusOnMount(input: HTMLInputElement) {
    input.focus();
  }
</script>

<svelte:window onpointerdown={closeWhenPressedOutside} />

<div
  class="palette"
  role="dialog"
  aria-modal="true"
  aria-label={translator.translate('palette.label')}
  bind:this={palette}
  onfocusout={closeWhenFocusMovesAway}
>
  <input
    role="combobox"
    aria-expanded="true"
    aria-controls="palette-results"
    aria-autocomplete="list"
    aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
    aria-label={translator.translate('palette.input.label')}
    placeholder={translator.translate('palette.input.placeholder')}
    spellcheck="false"
    autocomplete="off"
    bind:value={query}
    use:focusOnMount
    oninput={() => (activeIndex = 0)}
    onkeydown={handleKeydown}
  />
  <ul id="palette-results" role="listbox" aria-label={translator.translate('palette.results.label')}>
    {#each results as result, index (result.id)}
      <li
        id={optionId(index)}
        role="option"
        tabindex="-1"
        aria-selected={index === activeIndex}
        class:active={index === activeIndex}
        use:scrollIntoViewWhen={index === activeIndex}
        onmousedown={(event) => event.preventDefault()}
        onclick={() => choose(result)}
        onkeydown={handleKeydown}
      >
        <span class="label">
          {#each highlightSegments(result.label, result.matchedIndexes) as segment, segmentIndex (segmentIndex)}
            {#if segment.isMatch}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
          {/each}
        </span>
        {#if result.detail}<span class="detail">{result.detail}</span>{/if}
        {#if result.shortcut}<kbd>{result.shortcut}</kbd>{/if}
      </li>
    {/each}
  </ul>
  {#if results.length === 0}
    <p class="empty" role="status">{emptyMessage}</p>
  {/if}
</div>

<style>
  .palette {
    position: fixed;
    inset-block-start: 10vh;
    inset-inline-start: 50%;
    z-index: 30;
    display: flex;
    flex-direction: column;
    width: min(40rem, calc(100vw - 2rem));
    max-height: 60vh;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
    transform: translateX(-50%);
  }

  .palette:dir(rtl) {
    transform: translateX(50%);
  }

  input {
    margin: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-focus);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  ul {
    margin: 0;
    padding: 0 0 var(--space-2);
    list-style: none;
    overflow-y: auto;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    cursor: default;
  }

  li.active {
    background: var(--color-surface-selected);
  }

  .label {
    flex: none;
  }

  mark {
    background: none;
    color: var(--color-accent);
    font-weight: 700;
  }

  .detail {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  kbd {
    margin-inline-start: auto;
    padding: 0 var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    font-family: var(--font-ui);
    font-size: var(--text-size-small);
    white-space: nowrap;
  }

  .empty {
    margin: 0;
    padding: var(--space-2) var(--space-3) var(--space-3);
    color: var(--color-text-secondary);
  }
</style>
