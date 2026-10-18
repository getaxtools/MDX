<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';

  interface Props {
    document: RenderedActiveDocument | undefined;
    translator: Translator;
  }

  const { document, translator }: Props = $props();

  const items = $derived(
    document
      ? [
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
</script>

<footer class="status-bar" aria-label={translator.translate('statusBar.label')}>
  {#each items as item (item)}
    <span>{item}</span>
  {/each}
</footer>

<style>
  .status-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    min-height: 1.5rem;
    padding: var(--space-1) var(--space-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>
