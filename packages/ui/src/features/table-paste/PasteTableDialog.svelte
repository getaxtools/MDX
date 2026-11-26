<script lang="ts">
  import { parseSpreadsheetCells, toMarkdownTable } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';

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

  async function copyMarkdown() {
    await writeClipboard(markdown);
    copiedMarkdown = markdown;
  }
</script>

<Dialog
  title={translator.translate('tablePaste.title')}
  purpose={translator.translate('tablePaste.hint')}
  closeLabel={translator.translate('dialog.close.label')}
  closeTooltip={translator.translate('dialog.close.tooltip')}
  cancelLabel={translator.translate('tablePaste.cancel')}
  primary={{
    label: translator.translate('tablePaste.openAsNewDocument'),
    onActivate: () => onOpenAsNewDocument(markdown),
    isDisabled: !markdown,
  }}
  {onClose}
>
  <div class="fields">
    <label class="field">
      <span>{translator.translate('tablePaste.cellsLabel')}</span>
      <textarea
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
  </div>
  {#snippet footer()}
    <button type="button" disabled={!markdown} onclick={() => void copyMarkdown()}>
      {translator.translate(
        copiedMarkdown !== undefined && copiedMarkdown === markdown ? 'tablePaste.copied' : 'tablePaste.copy',
      )}
    </button>
  {/snippet}
</Dialog>

<style>
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: min(34rem, calc(100vw - 4 * var(--space-5)));
    max-width: 100%;
    font-family: var(--font-ui);
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
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font-family: var(--font-mono);
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
    border-radius: var(--radius-medium);
  }

  button {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 500;
    transition: background-color var(--motion-fast) ease-out;
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  button:disabled {
    color: var(--color-text-tertiary);
  }

  :is(button, textarea, input):focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
