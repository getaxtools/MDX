<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';

  interface Props {
    document: RenderedActiveDocument | undefined;
    translator: Translator;
    onUnsupportedLink: () => void;
  }

  const { document, translator, onUnsupportedLink }: Props = $props();

  function handleClick(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (!link) return;
    // The webview must never navigate away from the app, so every link is handled here.
    event.preventDefault();
    if (link.dataset.mdxLink === 'anchor') {
      const target = globalThis.document.getElementById(decodeURIComponent(link.hash.slice(1)));
      target?.scrollIntoView();
      return;
    }
    if (link.hasAttribute('href')) onUnsupportedLink();
  }
</script>

<main class="document-area">
  {#if document}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="rendered-document" aria-label={document.fileName} onclick={handleClick}>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html document.html}
    </article>
  {:else}
    <p class="empty-state">{translator.translate('document.emptyState')}</p>
  {/if}
</main>

<style>
  .document-area {
    overflow-y: auto;
    background: var(--color-background);
  }

  .empty-state {
    margin: var(--space-8) auto;
    max-width: var(--reading-measure);
    padding: 0 var(--space-6);
    color: var(--color-text-secondary);
    text-align: center;
  }
</style>
