<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { findTextRanges, type FindQuery } from './findTextRanges';
  import { clearFindHighlights, paintFindHighlights } from './paintFindHighlights';

  interface Props {
    searchRoot: HTMLElement | undefined;
    contentKey: string;
    focusRequest: number;
    /** Text and options to search for when the bar opens, instead of starting empty. */
    initialQuery?: FindQuery | undefined;
    translator: Translator;
    onClose: () => void;
  }

  const { searchRoot, contentKey, focusRequest, initialQuery, translator, onClose }: Props = $props();

  let query = $state('');
  let isCaseSensitive = $state(false);
  let isWholeWord = $state(false);
  let currentIndex = $state(0);
  let ranges: Range[] = $state.raw([]);
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (focusRequest === 0) return;
    if (initialQuery) {
      query = initialQuery.text;
      isCaseSensitive = initialQuery.isCaseSensitive;
      isWholeWord = initialQuery.isWholeWord;
    }
    input?.focus();
    input?.select();
  });

  $effect(() => {
    ranges =
      searchRoot && contentKey.length > 0
        ? findTextRanges(searchRoot, query, { isCaseSensitive, isWholeWord })
        : [];
    currentIndex = 0;
  });

  $effect(() => {
    paintFindHighlights(ranges, currentIndex);
    ranges[currentIndex]?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
  });

  $effect(() => clearFindHighlights);

  const status = $derived.by(() => {
    if (query.length === 0) return '';
    if (ranges.length === 0) return translator.translate('find.noMatches');
    return translator.translate('find.matchCount', { current: currentIndex + 1, total: ranges.length });
  });

  function step(direction: 1 | -1) {
    if (ranges.length === 0) return;
    currentIndex = (currentIndex + direction + ranges.length) % ranges.length;
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.altKey && toggleOptionForKey(event.key.toLowerCase())) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function toggleOptionForKey(key: string): boolean {
    if (key === 'c') isCaseSensitive = !isCaseSensitive;
    else if (key === 'w') isWholeWord = !isWholeWord;
    else return false;
    return true;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'F3') return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="find-bar" role="search" aria-label={translator.translate('find.label')}>
  <input
    bind:this={input}
    bind:value={query}
    type="search"
    aria-label={translator.translate('find.input.label')}
    placeholder={translator.translate('find.input.label')}
    onkeydown={handleInputKeydown}
  />
  <button
    class="option"
    aria-pressed={isCaseSensitive}
    aria-label={translator.translate('find.matchCase')}
    title={translator.translate('find.matchCase.hint')}
    onclick={() => (isCaseSensitive = !isCaseSensitive)}
    ><span class="symbol" aria-hidden="true" data-symbol={translator.translate('find.matchCase.symbol')}
    ></span></button
  >
  <button
    class="option"
    aria-pressed={isWholeWord}
    aria-label={translator.translate('find.wholeWord')}
    title={translator.translate('find.wholeWord.hint')}
    onclick={() => (isWholeWord = !isWholeWord)}
    ><span
      class="symbol whole-word"
      aria-hidden="true"
      data-symbol={translator.translate('find.wholeWord.symbol')}
    ></span></button
  >
  <span class="status" role="status">{status}</span>
  <button
    aria-label={translator.translate('find.previous')}
    title={translator.translate('find.previous')}
    disabled={ranges.length === 0}
    onclick={() => step(-1)}>↑</button
  >
  <button
    aria-label={translator.translate('find.next')}
    title={translator.translate('find.next')}
    disabled={ranges.length === 0}
    onclick={() => step(1)}>↓</button
  >
  <button
    aria-label={translator.translate('find.close')}
    title={translator.translate('find.close')}
    onclick={onClose}>×</button
  >
</div>

<style>
  .find-bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    gap: var(--space-1);
    align-items: center;
    width: fit-content;
    margin-inline-start: auto;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-top: 0;
    border-radius: 0 0 var(--radius-medium) var(--radius-medium);
    background: var(--color-surface);
    box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
    font-size: var(--text-size-body);
  }

  input {
    width: 14rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .status {
    min-width: 6rem;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  button {
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .option[aria-pressed='true'] {
    background: var(--color-surface-hover);
    outline: 1px solid var(--color-accent);
  }

  /* Drawn by CSS so the symbol is not text that the button's name would have to contain. */
  .symbol::before {
    content: attr(data-symbol);
  }

  .whole-word {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  button:disabled {
    color: var(--color-text-secondary);
  }

  :is(input, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
