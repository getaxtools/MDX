<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';

  interface Props {
    document: RenderedActiveDocument | undefined;
    zoomPercent: number;
    isSourceView: boolean;
    translator: Translator;
    onResetZoom: () => void;
  }

  const { document, zoomPercent, isSourceView, translator, onResetZoom }: Props = $props();

  const details = $derived(
    document
      ? [
          translator.translate(isSourceView ? 'statusBar.mode.source' : 'statusBar.mode.preview'),
          translator.translate('statusBar.words', { count: document.statistics.words }),
          translator.translate('statusBar.characters', { count: document.statistics.characters }),
          translator.translate('statusBar.readingTime', { minutes: document.statistics.readingMinutes }),
          translator.translate('statusBar.encoding', { encoding: document.encoding.toUpperCase() }),
          translator.translate('statusBar.lineEnding', {
            lineEnding: translator.translate(`statusBar.lineEnding.${document.lineEnding}`),
          }),
        ]
      : [],
  );
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
    <button
      title={translator.translate('statusBar.resetZoom', { percent: zoomPercent })}
      aria-label={translator.translate('statusBar.resetZoom', { percent: zoomPercent })}
      onclick={onResetZoom}
    >
      {translator.translate('statusBar.zoom', { percent: zoomPercent })}
    </button>
  </div>
</footer>

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

  button:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
