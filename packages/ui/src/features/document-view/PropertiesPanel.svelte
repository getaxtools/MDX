<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { readFrontMatterProperties } from '@mdx/renderer';

  interface Props {
    frontMatter: string;
    translator: Translator;
  }

  const { frontMatter, translator }: Props = $props();

  const properties = $derived(readFrontMatterProperties(frontMatter));
</script>

<details class="properties">
  <summary>{translator.translate('document.properties.title')}</summary>
  {#if properties}
    <dl>
      {#each properties as property, index (index)}
        <dt>{property.name}</dt>
        <dd>{property.values.join(', ')}</dd>
      {/each}
    </dl>
  {:else}
    <pre>{frontMatter}</pre>
  {/if}
</details>

<style>
  .properties {
    max-width: var(--reading-measure);
    margin: var(--space-4) auto 0;
    padding: var(--space-2) var(--space-6);
    box-sizing: border-box;
    font-size: var(--text-size-body);
    color: var(--color-text-secondary);
  }

  summary {
    cursor: default;
    font-weight: 600;
  }

  summary:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-4);
    margin: var(--space-2) 0 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--color-text);
    overflow-wrap: anywhere;
  }

  pre {
    margin: var(--space-2) 0 0;
    font-family: var(--font-mono);
    white-space: pre-wrap;
  }
</style>
