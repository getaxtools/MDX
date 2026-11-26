<script lang="ts">
  import { highestSeverityOf } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { severityLabelOf } from './findingPresentation';
  import type { InjectionCheckView } from './InjectionCheckActions';
  import SeverityIcon from './SeverityIcon.svelte';

  interface Props {
    check: InjectionCheckView;
    translator: Translator;
    /** Opens the findings panel; the badge itself never opens a dialog or the panel by itself. */
    onShow: () => void;
  }

  const { check, translator, onShow }: Props = $props();

  const findings = $derived(check.result?.findings ?? []);
  const highest = $derived(highestSeverityOf(findings.map((finding) => finding.severity)));
  const label = $derived(
    highest === undefined
      ? translator.translate('promptInjection.badge.noneLabel')
      : translator.translate('promptInjection.badge.label', {
          count: findings.length,
          severity: severityLabelOf(highest, translator),
        }),
  );
</script>

{#if check.result}
  <button class="injection-badge" aria-label={label} title={label} onclick={onShow}>
    {#if highest}
      <SeverityIcon severity={highest} />
      {translator.translate('promptInjection.badge.count', { count: findings.length })}
    {:else}
      <svg class="shield" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5l5 2v4c0 3-2.1 5.6-5 7-2.9-1.4-5-4-5-7v-4z" />
      </svg>
      {translator.translate('promptInjection.badge.none')}
    {/if}
  </button>
{/if}
<span class="visually-hidden" role="status">
  {check.isFirstHighResult ? translator.translate('promptInjection.badge.highFound') : ''}
</span>

<style>
  .injection-badge {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-xsmall);
    background: none;
    color: inherit;
    font: inherit;
  }

  .injection-badge:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .injection-badge:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .shield {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
