<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { previewRequirementsOf, refusalMessageOf, type SpecPreview } from './specPreview';

  interface Props {
    preview: SpecPreview;
    translator: Translator;
  }

  const { preview, translator }: Props = $props();

  const title = $derived(
    translator.translate('specViewer.preview.title', {
      name: preview.changeName,
      section: preview.capability,
    }),
  );
  const refusal = $derived(refusalMessageOf(preview, translator));
  const requirements = $derived(previewRequirementsOf(preview, translator));
</script>

<!-- Focusable so keyboard users can scroll a long page. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article tabindex="0" class="preview" aria-labelledby="spec-preview-heading">
  <h1 id="spec-preview-heading">{title}</h1>
  {#if refusal !== undefined}
    <p class="refusal" role="alert">{refusal}</p>
  {:else}
    <p class="notice">{translator.translate('specViewer.preview.readOnly')}</p>
    <h2>{translator.translate('specViewer.preview.requirements')}</h2>
    <ol class="requirements">
      {#each requirements as requirement (requirement.name)}
        <li>
          {requirement.name}
          {#if requirement.label}<span class="change-label">{requirement.label}</span>{/if}
        </li>
      {/each}
    </ol>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the renderer sanitized this HTML -->
    <div class="rendered-document">{@html preview.html ?? ''}</div>
  {/if}
</article>

<style>
  .preview {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text);
    overflow: auto;
  }

  h1 {
    margin: 0 0 var(--space-3);
    font-size: calc(var(--text-size-body) * 1.4);
  }

  h2 {
    margin: var(--space-3) 0 var(--space-2);
    font-size: calc(var(--text-size-body) * 1.15);
  }

  .requirements {
    margin: 0 0 var(--space-4);
  }

  .change-label {
    margin-inline-start: var(--space-2);
    padding: 0 0.4em;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-small);
    font-size: var(--text-size-small);
  }

  .refusal {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-alert-caution);
    border-radius: var(--radius-small);
  }

  .notice {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>
