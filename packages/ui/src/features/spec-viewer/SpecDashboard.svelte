<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { dashboardRowsOf, type ShownDashboard } from './specDashboard';

  interface Props {
    dashboard: ShownDashboard;
    translator: Translator;
    onOpenChange: (changeFolder: string) => void;
  }

  const { dashboard, translator, onOpenChange }: Props = $props();

  const COLUMN_KEYS: readonly MessageKey[] = [
    'specViewer.dashboard.column.change',
    'specViewer.dashboard.column.created',
    'specViewer.dashboard.column.tasks',
    'specViewer.dashboard.column.problems',
    'specViewer.dashboard.column.status',
  ];
  const rows = $derived(dashboardRowsOf(dashboard, translator));
  const title = $derived(
    translator.translate('specViewer.dashboard.tabTitle', { name: dashboard.project.name }),
  );
</script>

<article class="dashboard" aria-labelledby="spec-dashboard-heading">
  <h1 id="spec-dashboard-heading">{title}</h1>
  {#if rows.length === 0}
    <p>{translator.translate('specViewer.dashboard.noChanges')}</p>
  {:else}
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
  <p class="notice">{translator.translate('specViewer.dashboard.subsetNotice')}</p>
  <p class="notice">{translator.translate('specViewer.notAffiliated')}</p>
</article>

<style>
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
