<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { FolderSearchResults, LineMatch, TextSearchOptions } from '@mdx/platform';
  import { previewParts } from './previewParts';

  interface Props {
    translator: Translator;
    /** Goes up each time the search box should get the keyboard focus. */
    focusRequest?: number | undefined;
    hasFolders: boolean;
    onSearch: (query: string, options: TextSearchOptions) => Promise<FolderSearchResults>;
    onOpenMatch: (path: string, query: string, options: TextSearchOptions) => void;
  }

  const { translator, focusRequest, hasFolders, onSearch, onOpenMatch }: Props = $props();

  const TYPING_PAUSE_MS = 300;

  type SearchState =
    | { readonly kind: 'idle' }
    | { readonly kind: 'searching' }
    | { readonly kind: 'failed' }
    | { readonly kind: 'done'; readonly results: FolderSearchResults; readonly query: string };

  let query = $state('');
  let isCaseSensitive = $state(false);
  let isWholeWord = $state(false);
  let searchState = $state.raw<SearchState>({ kind: 'idle' });
  let input: HTMLInputElement | undefined = $state();
  let latestSearch = 0;
  let pendingSearch: ReturnType<typeof globalThis.setTimeout> | undefined;

  $effect(() => {
    if (focusRequest === undefined) return;
    input?.focus();
    input?.select();
  });

  $effect(() => () => globalThis.clearTimeout(pendingSearch));

  const options = $derived<TextSearchOptions>({ isCaseSensitive, isWholeWord });
  const matchCount = $derived(
    searchState.kind === 'done'
      ? searchState.results.documents.reduce((count, document) => count + document.matches.length, 0)
      : 0,
  );

  function scheduleSearch() {
    globalThis.clearTimeout(pendingSearch);
    pendingSearch = globalThis.setTimeout(() => void search(), TYPING_PAUSE_MS);
  }

  async function search() {
    globalThis.clearTimeout(pendingSearch);
    const searchedQuery = query;
    const searchNumber = ++latestSearch;
    if (searchedQuery.trim() === '') {
      searchState = { kind: 'idle' };
      return;
    }
    searchState = { kind: 'searching' };
    try {
      const results = await onSearch(searchedQuery, options);
      if (searchNumber === latestSearch) searchState = { kind: 'done', results, query: searchedQuery };
    } catch {
      if (searchNumber === latestSearch) searchState = { kind: 'failed' };
    }
  }

  function toggleCaseSensitive() {
    isCaseSensitive = !isCaseSensitive;
    void search();
  }

  function toggleWholeWord() {
    isWholeWord = !isWholeWord;
    void search();
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void search();
    }
  }

  function openMatch(path: string) {
    if (searchState.kind === 'done') onOpenMatch(path, searchState.query, options);
  }

  function lineLabel(match: LineMatch): string {
    return translator.translate('folderSearch.line', { number: match.lineNumber });
  }
</script>

<section class="folder-search" aria-labelledby="folder-search-heading">
  <h2 id="folder-search-heading">{translator.translate('folderSearch.title')}</h2>
  <div class="search-row">
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      aria-label={translator.translate('folderSearch.input.label')}
      placeholder={translator.translate('folderSearch.input.label')}
      disabled={!hasFolders}
      oninput={scheduleSearch}
      onkeydown={handleInputKeydown}
    />
    <button
      class="option"
      aria-pressed={isCaseSensitive}
      aria-label={translator.translate('find.matchCase')}
      title={translator.translate('find.matchCase')}
      disabled={!hasFolders}
      onclick={toggleCaseSensitive}
      ><span class="symbol" aria-hidden="true" data-symbol={translator.translate('find.matchCase.symbol')}
      ></span></button
    >
    <button
      class="option"
      aria-pressed={isWholeWord}
      aria-label={translator.translate('find.wholeWord')}
      title={translator.translate('find.wholeWord')}
      disabled={!hasFolders}
      onclick={toggleWholeWord}
      ><span
        class="symbol whole-word"
        aria-hidden="true"
        data-symbol={translator.translate('find.wholeWord.symbol')}
      ></span></button
    >
  </div>
  <p class="status" role="status">
    {#if !hasFolders}
      {translator.translate('folderSearch.noFolders')}
    {:else if searchState.kind === 'searching'}
      {translator.translate('folderSearch.searching')}
    {:else if searchState.kind === 'failed'}
      {translator.translate('folderSearch.failed')}
    {:else if searchState.kind === 'done' && matchCount === 0}
      {translator.translate('folderSearch.noResults')}
    {:else if searchState.kind === 'done'}
      {translator.translate('folderSearch.resultCount', {
        matches: matchCount,
        documents: searchState.results.documents.length,
      })}
      {#if searchState.results.isIncomplete}
        {translator.translate('folderSearch.incomplete')}
      {/if}
    {/if}
  </p>
  {#if searchState.kind === 'done' && matchCount > 0}
    <ul class="results" aria-label={translator.translate('folderSearch.results.label')}>
      {#each searchState.results.documents as document (document.location.canonicalKey)}
        <li>
          <p class="document" title={document.location.displayPath}>{document.location.fileName}</p>
          <ul>
            {#each document.matches as match (match.lineNumber)}
              <li>
                <button class="match" onclick={() => openMatch(document.location.displayPath)}>
                  <span class="visually-hidden">{document.location.fileName}, {lineLabel(match)}:</span>
                  {#each previewParts(match) as part, index (index)}
                    {#if part.isMatch}<mark>{part.text}</mark>{:else}{part.text}{/if}
                  {/each}
                </button>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .folder-search {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: var(--space-2) var(--space-3);
    overflow-y: auto;
    background: var(--color-surface);
    font-size: var(--text-size-body);
  }

  h2 {
    margin: var(--space-1) 0 var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .search-row {
    display: flex;
    gap: var(--space-1);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .option {
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
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

  .status {
    margin: var(--space-2) 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .results,
  .results ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .document {
    margin: var(--space-2) 0 var(--space-1);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .match {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    padding-inline-start: var(--space-4);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .match:hover {
    background: var(--color-surface-hover);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  mark {
    background: var(--color-mark-background);
    color: var(--color-mark-text);
  }

  :is(input, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
