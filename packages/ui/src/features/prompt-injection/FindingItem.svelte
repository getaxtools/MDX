<script lang="ts">
  import type { InjectionFinding } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import {
    decodedTextOf,
    explanationOf,
    positionLabelOf,
    ruleTitleOf,
    severityLabelOf,
  } from './findingPresentation';
  import SeverityIcon from './SeverityIcon.svelte';

  interface Props {
    finding: InjectionFinding;
    /** Listed under the ignored findings, with a way to show it again. */
    isIgnored?: boolean;
    translator: Translator;
    onReveal: (finding: InjectionFinding) => void;
    onCommand: (command: ViewerCommand) => void;
  }

  const { finding, isIgnored = false, translator, onReveal, onCommand }: Props = $props();

  const ruleTitle = $derived(ruleTitleOf(finding, translator));
  const decoded = $derived(decodedTextOf(finding));
  const lineNumber = $derived(finding.line + 1);
</script>

<li class="finding">
  <button class="reveal" onclick={() => onReveal(finding)}>
    <span class="severity">
      <SeverityIcon severity={finding.severity} />
      <span>{severityLabelOf(finding.severity, translator)}</span>
    </span>
    <span class="rule">{ruleTitle}</span>
    <span class="position">{positionLabelOf(finding, translator)}</span>
  </button>
  <bdi class="excerpt" dir="ltr">{finding.excerpt}</bdi>
  <p class="explanation">{explanationOf(finding, translator)}</p>
  {#if decoded !== undefined}
    <p class="decoded">
      {translator.translate('promptInjection.finding.decoded')}
      <bdi dir="ltr">{decoded}</bdi>
    </p>
  {/if}
  <div class="actions">
    {#if isIgnored}
      <button
        aria-label={translator.translate('promptInjection.finding.showAgainLabel', {
          rule: ruleTitle,
          line: lineNumber,
        })}
        onclick={() => onCommand({ kind: 'showInjectionFindingAgain', finding })}
      >
        {translator.translate('promptInjection.finding.showAgain')}
      </button>
    {:else}
      <button
        aria-label={translator.translate('promptInjection.finding.ignoreLabel', {
          rule: ruleTitle,
          line: lineNumber,
        })}
        onclick={() => onCommand({ kind: 'ignoreInjectionFinding', finding, scope: 'finding' })}
      >
        {translator.translate('promptInjection.finding.ignore')}
      </button>
      <button
        aria-label={translator.translate('promptInjection.finding.ignoreRuleLabel', { rule: ruleTitle })}
        onclick={() => onCommand({ kind: 'ignoreInjectionFinding', finding, scope: 'ruleInDocument' })}
      >
        {translator.translate('promptInjection.finding.ignoreRule')}
      </button>
    {/if}
  </div>
</li>

<style>
  .finding {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border-block-end: 1px solid var(--color-border);
  }

  .reveal {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    align-items: center;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    text-align: start;
  }

  .reveal:hover {
    background: var(--color-surface-hover);
  }

  .severity {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
    font-weight: 600;
  }

  .rule {
    font-weight: 500;
  }

  .position {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .excerpt {
    display: block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-small);
    background: var(--color-code-background);
    font-family: var(--font-mono);
    font-size: var(--text-size-small);
    overflow-wrap: anywhere;
    unicode-bidi: isolate;
  }

  .explanation,
  .decoded {
    margin: 0;
    padding-inline: var(--space-1);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }

  .decoded bdi {
    font-family: var(--font-mono);
    color: var(--color-text);
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-inline: var(--space-1);
  }

  .actions button {
    padding: 0 var(--space-2);
    min-height: 24px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-small);
  }

  .actions button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  @media (forced-colors: active) {
    .actions button {
      border-color: ButtonText;
    }
  }
</style>
