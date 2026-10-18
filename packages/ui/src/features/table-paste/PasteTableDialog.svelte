<script lang="ts">
  import { parseSpreadsheetCells, toMarkdownTable } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';

  interface Props {
    translator: Translator;
    renderPreview: (markdown: string) => string;
    writeClipboard?: (text: string) => Promise<void>;
    onOpenAsNewDocument: (markdown: string) => void;
    onClose: () => void;
  }

  const {
    translator,
    renderPreview,
    writeClipboard = (text) => globalThis.navigator.clipboard.writeText(text),
    onOpenAsNewDocument,
    onClose,
  }: Props = $props();

  const MAX_PASTED_CHARACTERS = 2_000_000;

  let pastedText = $state('');
  let hasHeaderRow = $state(true);
  let copiedMarkdown: string | undefined = $state();
  let cellsInput: HTMLTextAreaElement | undefined = $state();

  const isTooLarge = $derived(pastedText.length > MAX_PASTED_CHARACTERS);
  const markdown = $derived(
    isTooLarge
      ? ''
      : toMarkdownTable(parseSpreadsheetCells(pastedText), {
          hasHeaderRow,
          columnName: (columnNumber) =>
            translator.translate('tablePaste.columnName', { number: columnNumber }),
        }),
  );
  const previewHtml = $derived(markdown ? renderPreview(markdown) : '');

  $effect(() => cellsInput?.focus());

  async function copyMarkdown() {
    await writeClipboard(markdown);
    copiedMarkdown = markdown;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  }
</script>

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="paste-table-title"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <h2 id="paste-table-title">{translator.translate('tablePaste.title')}</h2>
    <p class="hint">{translator.translate('tablePaste.hint')}</p>
    <label class="field">
      <span>{translator.translate('tablePaste.cellsLabel')}</span>
      <textarea
        bind:this={cellsInput}
        bind:value={pastedText}
        rows="5"
        spellcheck="false"
        placeholder={translator.translate('tablePaste.cellsPlaceholder')}></textarea>
    </label>
    <label class="option">
      <input type="checkbox" bind:checked={hasHeaderRow} />
      {translator.translate('tablePaste.hasHeaderRow')}
    </label>
    {#if isTooLarge}
      <p class="hint" role="alert">{translator.translate('tablePaste.tooLarge')}</p>
    {:else if markdown}
      <label class="field">
        <span>{translator.translate('tablePaste.markdownLabel')}</span>
        <textarea class="markdown" readonly rows="6" spellcheck="false" value={markdown}></textarea>
      </label>
      <section class="preview" aria-label={translator.translate('tablePaste.previewLabel')}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- the renderer sanitizes its output -->
        <div class="rendered-document">{@html previewHtml}</div>
      </section>
    {/if}
    <div class="actions">
      <button class="primary" disabled={!markdown} onclick={() => onOpenAsNewDocument(markdown)}>
        {translator.translate('tablePaste.openAsNewDocument')}
      </button>
      <button disabled={!markdown} onclick={() => void copyMarkdown()}>
        {translator.translate(
          copiedMarkdown !== undefined && copiedMarkdown === markdown
            ? 'tablePaste.copied'
            : 'tablePaste.copy',
        )}
      </button>
      <button onclick={onClose}>{translator.translate('tablePaste.cancel')}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 35%);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: min(48rem, 92vw);
    max-height: 90vh;
    overflow-y: auto;
    padding: var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font-family: var(--font-ui);
    font-size: var(--text-size-body);
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .hint {
    margin: 0;
    color: var(--color-text-secondary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-weight: 600;
  }

  textarea {
    resize: vertical;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-code, monospace);
    font-size: var(--text-size-small);
    font-weight: normal;
    white-space: pre;
  }

  .option {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .preview {
    overflow-x: auto;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  button {
    padding: var(--space-1) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  button:disabled {
    color: var(--color-text-secondary);
  }

  .primary:not(:disabled) {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  :is(button, textarea, input):focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
