<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import SpecProblemsList from './SpecProblemsList.svelte';
  import { findingRowsOf, fullPathOf, type ShownChangePage } from './specChangePage';

  interface Props {
    page: ShownChangePage;
    translator: Translator;
    onOpenDocument: (documentPath: string) => void;
    onOpenFinding: (documentPath: string, line: number | undefined) => void;
    onOpenPreview?: (capability: string) => void;
  }

  const {
    page,
    translator,
    onOpenDocument,
    onOpenFinding,
    onOpenPreview = () => undefined,
  }: Props = $props();

  interface DocumentEntry {
    readonly label: string;
    readonly path?: string | undefined;
  }

  const NAMED_DOCUMENTS: readonly (readonly [MessageKey, 'proposal' | 'design' | 'tasks'])[] = [
    ['specViewer.document.proposal', 'proposal'],
    ['specViewer.document.design', 'design'],
    ['specViewer.document.tasks', 'tasks'],
  ];

  const change = $derived(page.change);
  const documents = $derived<DocumentEntry[]>([
    ...NAMED_DOCUMENTS.map(([key, name]) => ({
      label: translator.translate(key),
      path: change.documents[name],
    })),
    ...change.documents.deltas.map((delta) => ({
      label: translator.translate('specViewer.document.delta', { name: delta.name }),
      path: delta.path,
    })),
  ]);
  const notGiven = $derived(translator.translate('specViewer.changePage.notGiven'));
  const rows = $derived(findingRowsOf(page, translator));
</script>

{#snippet documentItem(entry: DocumentEntry)}
  <li>
    {#if entry.path}
      <button
        class="link"
        onclick={() => entry.path && onOpenDocument(fullPathOf(page.scanned.root, entry.path))}
      >
        {entry.label}
      </button>
    {:else}
      <span class="missing"
        >{translator.translate('specViewer.changePage.notWritten', { name: entry.label })}</span
      >
    {/if}
  </li>
{/snippet}

<!-- Focusable so keyboard users can scroll a long page. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article tabindex="0" class="change-page" aria-labelledby="spec-change-heading">
  <h1 id="spec-change-heading">{change.name}</h1>
  <dl>
    <dt>{translator.translate('specViewer.changePage.created')}</dt>
    <dd>{change.created ?? notGiven}</dd>
    <dt>{translator.translate('specViewer.changePage.schema')}</dt>
    <dd>{change.schema ?? notGiven}</dd>
    <dt>{translator.translate('specViewer.changePage.specChanges')}</dt>
    <dd>
      {translator.translate(
        change.isSkippingSpecs
          ? 'specViewer.changePage.noSpecChanges'
          : 'specViewer.changePage.withSpecChanges',
      )}
    </dd>
  </dl>
  <h2>{translator.translate('specViewer.changePage.documents')}</h2>
  <ul class="documents">
    {#each documents as entry (entry.label)}
      <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
      {@render documentItem(entry)}
    {/each}
  </ul>
  {#if (change.otherDocuments ?? []).length > 0}
    <h2>{translator.translate('specViewer.changePage.otherDocuments')}</h2>
    <ul class="documents">
      {#each change.otherDocuments ?? [] as other (other.path)}
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
        {@render documentItem({ label: other.name, path: other.path })}
      {/each}
    </ul>
  {/if}
  {#if change.documents.deltas.length > 0}
    <h2>{translator.translate('specViewer.preview.heading')}</h2>
    <ul class="documents">
      {#each change.documents.deltas as delta (delta.path)}
        <li>
          <button class="link" onclick={() => onOpenPreview(delta.name)}>
            {translator.translate('specViewer.preview.open', { name: delta.name })}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <SpecProblemsList {rows} {translator} {onOpenFinding} />
</article>

<style>
  .change-page {
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

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }

  dt {
    color: var(--color-text-secondary);
  }

  dd {
    margin: 0;
  }

  .documents {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .documents li {
    padding: 2px 0;
  }

  .missing {
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .link:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
