<script lang="ts">
  import type { TaskGroupProgress } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { featureDocumentEntries } from './featureDocumentList';
  import { fullPathOf } from './specChangePage';
  import type { ShownFeaturePage } from './specFeaturePage';

  interface Props {
    page: ShownFeaturePage;
    translator: Translator;
    onOpenDocument: (documentPath: string) => void;
    onOpenFinding: (documentPath: string, line: number | undefined) => void;
  }

  const { page, translator, onOpenDocument, onOpenFinding }: Props = $props();

  const feature = $derived(page.feature);
  const documents = $derived(featureDocumentEntries(feature.documents, translator));
  const notGiven = $derived(translator.translate('specViewer.changePage.notGiven'));
  const parallelTasks = $derived((feature.tasks?.tasks ?? []).filter((task) => task.isParallel));

  function progressOf(group: TaskGroupProgress): string {
    return translator.translate('specViewer.change.progress', { current: group.done, total: group.total });
  }

  function openAt(relativePath: string, line?: number) {
    const path = fullPathOf(page.scanned.root, relativePath);
    if (line === undefined) onOpenDocument(path);
    else onOpenFinding(path, line);
  }
</script>

{#snippet progressTable(
  titleKey: 'specViewer.featurePage.byPhase' | 'specViewer.featurePage.byStory',
  groups: readonly TaskGroupProgress[],
)}
  {#if groups.length > 0}
    <h2>{translator.translate(titleKey)}</h2>
    <table>
      <tbody>
        {#each groups as group (group.name)}
          <tr><th scope="row">{group.name}</th><td>{progressOf(group)}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/snippet}

<!-- Focusable so keyboard users can scroll a long page. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article tabindex="0" class="feature-page" aria-labelledby="spec-feature-heading">
  <h1 id="spec-feature-heading">{feature.name}</h1>
  {#if feature.isCurrent}
    <p class="current">{translator.translate('specViewer.feature.currentBadge')}</p>
  {/if}
  <dl>
    <dt>{translator.translate('specViewer.featurePage.number')}</dt>
    <dd>{feature.timestamp ?? feature.name.split('-')[0]}</dd>
    <dt>{translator.translate('specViewer.featurePage.branch')}</dt>
    <dd>{feature.name}</dd>
    <dt>{translator.translate('specViewer.featurePage.status')}</dt>
    <dd>{feature.status ?? notGiven}</dd>
  </dl>
  <h2>{translator.translate('specViewer.changePage.documents')}</h2>
  <ul class="plain">
    {#each documents as entry (entry.label)}
      <li>
        {#if entry.path}
          <button class="link" onclick={() => entry.path && openAt(entry.path)}>{entry.label}</button>
        {:else}
          <span class="missing"
            >{translator.translate('specViewer.changePage.notWritten', { name: entry.label })}</span
          >
        {/if}
      </li>
    {/each}
  </ul>
  <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
  {@render progressTable('specViewer.featurePage.byPhase', feature.tasks?.phases ?? [])}
  <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
  {@render progressTable('specViewer.featurePage.byStory', feature.tasks?.stories ?? [])}
  {#if parallelTasks.length > 0}
    <h2>{translator.translate('specViewer.featurePage.parallelTasks')}</h2>
    <ul class="plain">
      {#each parallelTasks as task (task.lineNumber)}
        <li>
          <span class="tag">{translator.translate('specViewer.featurePage.parallel')}</span>
          {task.id ?? ''}
          {task.description}
        </li>
      {/each}
    </ul>
  {/if}
  <h2>
    {translator.translate('specViewer.featurePage.clarifications', { count: feature.clarifications.length })}
  </h2>
  <ul class="plain">
    {#each feature.clarifications as marker, index (index)}
      <li>
        <button class="link" onclick={() => openAt(marker.path, marker.line)}>
          {translator.translate('specViewer.problems.place', { path: marker.path, number: marker.line })}
        </button>
      </li>
    {/each}
  </ul>
</article>

<style>
  .feature-page {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text);
    overflow: auto;
  }

  h1 {
    margin: 0 0 var(--space-2);
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

  .plain {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plain li {
    padding: 2px 0;
  }

  th,
  td {
    padding: 2px var(--space-2) 2px 0;
    text-align: start;
    font-weight: 400;
  }

  .current,
  .tag {
    display: inline-block;
    padding: 0 0.4em;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-small);
    font-size: var(--text-size-small);
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
