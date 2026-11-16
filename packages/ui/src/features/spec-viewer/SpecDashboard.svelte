<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { dashboardRowsOf, featureRowsOf, folderSpecRowsOf, type ShownDashboard } from './specDashboard';

  interface Props {
    dashboard: ShownDashboard;
    translator: Translator;
    onOpenChange: (changeFolder: string) => void;
    onOpenFeature?: (featureFolder: string) => void;
  }

  const { dashboard, translator, onOpenChange, onOpenFeature = () => undefined }: Props = $props();

  const COLUMN_KEYS: readonly MessageKey[] = [
    'specViewer.dashboard.column.change',
    'specViewer.dashboard.column.created',
    'specViewer.dashboard.column.tasks',
    'specViewer.dashboard.column.problems',
    'specViewer.dashboard.column.status',
  ];
  const FEATURE_COLUMN_KEYS: readonly MessageKey[] = [
    'specViewer.dashboard.column.feature',
    'specViewer.featurePage.number',
    'specViewer.featurePage.status',
    'specViewer.dashboard.column.tasks',
    'specViewer.dashboard.column.clarifications',
  ];
  const rows = $derived(dashboardRowsOf(dashboard, translator));
  const featureRows = $derived(featureRowsOf(dashboard, translator));
  const folderSpecRows = $derived(folderSpecRowsOf(dashboard, translator));
  const decisionRecords = $derived(dashboard.project.decisionRecords);
  const FOLDER_SPEC_COLUMN_KEYS: readonly MessageKey[] = [
    'specViewer.dashboard.column.spec',
    'specViewer.dashboard.column.kind',
    'specViewer.dashboard.column.notWritten',
    'specViewer.dashboard.column.tasks',
  ];
  const RECORD_COLUMN_KEYS: readonly MessageKey[] = [
    'specViewer.featurePage.number',
    'specViewer.dashboard.column.title',
    'specViewer.featurePage.status',
    'specViewer.dashboard.column.date',
  ];
  const isChangeBased = $derived(dashboard.project.layouts.includes('changeBased'));
  const title = $derived(
    translator.translate('specViewer.dashboard.tabTitle', { name: dashboard.project.name }),
  );
</script>

<!-- Focusable so keyboard users can scroll a long page. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article tabindex="0" class="dashboard" aria-labelledby="spec-dashboard-heading">
  <h1 id="spec-dashboard-heading">{title}</h1>
  {#if isChangeBased && rows.length === 0}
    <p>{translator.translate('specViewer.dashboard.noChanges')}</p>
  {:else if isChangeBased}
    <table>
      <thead>
        <tr>
          {#each COLUMN_KEYS as key (key)}
            <th scope="col">{translator.translate(key)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.name)}
          <tr>
            <th scope="row">
              <button class="link" onclick={() => onOpenChange(row.changeFolder)}>{row.name}</button>
            </th>
            <td>{row.created}</td>
            <td>{row.tasks}</td>
            <td>{row.problems}</td>
            <td>{row.status}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if featureRows.length > 0}
    <h2>{translator.translate('specViewer.dashboard.features')}</h2>
    <table>
      <thead>
        <tr>
          {#each FEATURE_COLUMN_KEYS as key (key)}
            <th scope="col">{translator.translate(key)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each featureRows as row (row.folder)}
          <tr>
            <th scope="row">
              <button class="link" onclick={() => onOpenFeature(row.folder)}>{row.name}</button>
              {#if row.isCurrent}<span class="current"
                  >{translator.translate('specViewer.feature.currentBadge')}</span
                >{/if}
            </th>
            <td>{row.number}</td>
            <td>{row.status}</td>
            <td>{row.tasks}</td>
            <td>{row.clarifications}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if folderSpecRows.length > 0}
    <h2>{translator.translate('specViewer.group.folderSpecs')}</h2>
    <table>
      <thead>
        <tr>
          {#each FOLDER_SPEC_COLUMN_KEYS as key (key)}<th scope="col">{translator.translate(key)}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each folderSpecRows as row (row.name)}
          <tr><th scope="row">{row.name}</th><td>{row.kind}</td><td>{row.missing}</td><td>{row.tasks}</td></tr
          >
        {/each}
      </tbody>
    </table>
  {/if}
  {#if decisionRecords.length > 0}
    <h2>{translator.translate('specViewer.group.decisionRecords')}</h2>
    <table>
      <thead>
        <tr>
          {#each RECORD_COLUMN_KEYS as key (key)}<th scope="col">{translator.translate(key)}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each decisionRecords as record (record.path)}
          <tr>
            <th scope="row">{record.number}</th>
            <td>{record.title ?? ''}</td>
            <td>{record.status ?? ''}</td>
            <td>{record.date ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if isChangeBased}
    <p class="notice">{translator.translate('specViewer.dashboard.subsetNotice')}</p>
  {/if}
  <p class="notice">{translator.translate('specViewer.notAffiliated')}</p>
</article>

<style>
  h2 {
    margin: var(--space-4) 0 var(--space-2);
    font-size: calc(var(--text-size-body) * 1.15);
  }

  .current {
    margin-inline-start: var(--space-2);
    padding: 0 0.4em;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-small);
    font-size: var(--text-size-small);
    font-weight: 400;
  }

  .dashboard {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text);
    overflow: auto;
  }

  h1 {
    margin: 0 0 var(--space-3);
    font-size: calc(var(--text-size-body) * 1.4);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    padding: var(--space-1) var(--space-2);
    border-block-end: 1px solid var(--color-border);
    text-align: start;
    white-space: nowrap;
  }

  thead th {
    color: var(--color-text-secondary);
    font-weight: 600;
  }

  tbody th {
    font-weight: 500;
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

  .notice {
    margin-block-start: var(--space-3);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>
