<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, type ContextMenuRequest } from '../../components/ContextMenuItem';
  import {
    DETECT_ENCODING_ITEM,
    encodingMenuItems,
    type EncodingMenuItemId,
  } from '../encodings/reopenEncodings';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';

  interface Props {
    document: RenderedActiveDocument | undefined;
    zoomPercent: number;
    isSourceView: boolean;
    isEditing?: boolean;
    hasUnsavedChanges?: boolean;
    translator: Translator;
    onResetZoom: () => void;
    onReopenWithEncoding?: (encoding: string | undefined) => void;
  }

  const {
    document,
    zoomPercent,
    isSourceView,
    isEditing = false,
    hasUnsavedChanges = false,
    translator,
    onResetZoom,
    onReopenWithEncoding = () => undefined,
  }: Props = $props();

  let encodingMenuRequest: ContextMenuRequest | undefined = $state();

  function chooseEncoding(itemId: EncodingMenuItemId) {
    onReopenWithEncoding(itemId === DETECT_ENCODING_ITEM ? undefined : itemId);
  }

  const modeKey = $derived.by(() => {
    if (isEditing) return 'statusBar.mode.editing';
    return isSourceView ? 'statusBar.mode.source' : 'statusBar.mode.preview';
  });

  const details = $derived(
    document
      ? [
          translator.translate(modeKey),
          ...(hasUnsavedChanges ? [translator.translate('statusBar.unsaved')] : []),
          translator.translate('statusBar.words', { count: document.statistics.words }),
          translator.translate('statusBar.characters', { count: document.statistics.characters }),
          translator.translate('statusBar.readingTime', { minutes: document.statistics.readingMinutes }),
        ]
      : [],
  );
  const encodingName = $derived(document?.encoding.toUpperCase() ?? '');
  const location = $derived(
    document?.isUntitled
      ? translator.translate('statusBar.notSaved', { fileName: document.fileName })
      : document?.displayPath,
  );
</script>

<footer class="status-bar" aria-label={translator.translate('statusBar.label')}>
  <span class="location" title={location}>{location ?? ''}</span>
  <div class="details">
    {#each details as detail (detail)}
      <span>{detail}</span>
    {/each}
    {#if document}
      <button
        title={translator.translate('statusBar.chooseEncoding', { encoding: encodingName })}
        aria-haspopup="menu"
        disabled={document.isUntitled}
        onclick={(event) => (encodingMenuRequest = contextMenuPosition(event))}
      >
        {translator.translate('statusBar.encoding', { encoding: encodingName })}
      </button>
      <span>
        {translator.translate('statusBar.lineEnding', {
          lineEnding: translator.translate(`statusBar.lineEnding.${document.lineEnding}`),
        })}
      </span>
    {/if}
    <button
      title={translator.translate('statusBar.resetZoom', { percent: zoomPercent })}
      aria-label={translator.translate('statusBar.resetZoom', { percent: zoomPercent })}
      onclick={onResetZoom}
    >
      {translator.translate('statusBar.zoom', { percent: zoomPercent })}
    </button>
  </div>
</footer>
{#if encodingMenuRequest}
  <ContextMenu
    label={translator.translate('encoding.menu.label')}
    items={encodingMenuItems(translator)}
    position={encodingMenuRequest}
    onChoose={chooseEncoding}
    onClose={() => (encodingMenuRequest = undefined)}
  />
{/if}

<style>
  .status-bar {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    justify-content: space-between;
    min-height: 1.5rem;
    padding: 0 var(--space-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-size-small);
  }

  .location {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .details {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-4);
    align-items: center;
  }

  button {
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: inherit;
    font: inherit;
  }

  button:disabled {
    color: inherit;
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
