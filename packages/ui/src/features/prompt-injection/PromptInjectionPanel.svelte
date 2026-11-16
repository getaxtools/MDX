<script lang="ts">
  import type { InjectionFinding } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import FindingItem from './FindingItem.svelte';
  import { groupFindings, severityLabelOf, summaryOf } from './findingPresentation';
  import type { InjectionCheckView } from './InjectionCheckActions';

  interface Props {
    hasDocument: boolean;
    /** The check of the shown document; undefined until one has started. */
    check: InjectionCheckView | undefined;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { hasDocument, check, translator, onCommand }: Props = $props();

  let isShowingIgnored = $state(false);
  let announcement = $state('');

  const result = $derived(check?.result);
  const groups = $derived(groupFindings(result?.findings ?? []));
  const isMoreNotShown = $derived(result !== undefined && result.isPartial && !check?.isCharactersOnly);

  function reveal(finding: InjectionFinding) {
    onCommand({ kind: 'revealInjectionFinding', finding });
    announcement = translator.translate('promptInjection.panel.revealedAt', { line: finding.line + 1 });
  }
</script>

<section class="prompt-injection" data-focus-region aria-labelledby="prompt-injection-heading">
  <header>
    <h2 id="prompt-injection-heading">{translator.translate('promptInjection.panel.title')}</h2>
    {#if hasDocument}
      <button class="check" onclick={() => onCommand({ kind: 'checkForPromptInjection' })}>
        {translator.translate(check ? 'promptInjection.panel.checkAgain' : 'promptInjection.panel.checkNow')}
      </button>
    {/if}
  </header>
  <p class="visually-hidden" role="status">{announcement}</p>
  {#if !hasDocument}
    <p class="note">{translator.translate('promptInjection.panel.noDocument')}</p>
  {:else if !check}
    <p class="note">{translator.translate('promptInjection.panel.notChecked')}</p>
  {:else}
    {#if check.status === 'checking'}
      <p class="note" aria-live="polite">{translator.translate('promptInjection.panel.checking')}</p>
    {:else if check.status === 'failed'}
      <p class="note">{translator.translate('promptInjection.panel.failed')}</p>
    {/if}
    {#if result}
      <p class="summary">{summaryOf(result, translator)}</p>
      {#if result.isAgentFile}
        <p class="note">{translator.translate('promptInjection.panel.agentFile')}</p>
      {/if}
      {#if check.isCharactersOnly}
        <p class="note">{translator.translate('promptInjection.panel.partlyChecked')}</p>
      {/if}
      {#if isMoreNotShown}
        <p class="note">
          {translator.translate('promptInjection.panel.moreNotShown', { count: result.findings.length })}
        </p>
      {/if}
      {#each groups.severityGroups as group (group.severity)}
        <section class="group" aria-labelledby="prompt-injection-group-{group.severity}">
          <h3 id="prompt-injection-group-{group.severity}">
            {translator.translate('promptInjection.panel.group', {
              severity: severityLabelOf(group.severity, translator),
              count: group.findings.length,
            })}
          </h3>
          <ul>
            {#each group.findings as finding (`${finding.ruleId}:${String(finding.from)}`)}
              <FindingItem {finding} {translator} onReveal={reveal} {onCommand} />
            {/each}
          </ul>
        </section>
      {/each}
      {#if groups.hiddenContent.length > 0}
        <details class="group">
          <summary>
            {translator.translate('promptInjection.panel.hiddenContent', {
              count: groups.hiddenContent.length,
            })}
          </summary>
          <ul>
            {#each groups.hiddenContent as finding (`${finding.ruleId}:${String(finding.from)}`)}
              <FindingItem {finding} {translator} onReveal={reveal} {onCommand} />
            {/each}
          </ul>
        </details>
      {/if}
      {#if result.ignoredCount > 0}
        <div class="ignored">
          <span
            >{translator.translate('promptInjection.panel.ignoredCount', {
              count: result.ignoredCount,
            })}</span
          >
          <button aria-expanded={isShowingIgnored} onclick={() => (isShowingIgnored = !isShowingIgnored)}>
            {translator.translate(
              isShowingIgnored ? 'promptInjection.panel.hideIgnored' : 'promptInjection.panel.showIgnored',
            )}
          </button>
        </div>
        {#if isShowingIgnored}
          <section class="group" aria-labelledby="prompt-injection-ignored">
            <h3 id="prompt-injection-ignored">
              {translator.translate('promptInjection.panel.ignoredHeading')}
            </h3>
            <ul>
              {#each check.ignoredFindings as finding (`${finding.ruleId}:${String(finding.from)}`)}
                <FindingItem {finding} isIgnored {translator} onReveal={reveal} {onCommand} />
              {/each}
            </ul>
          </section>
        {/if}
      {/if}
    {/if}
  {/if}
  <footer>
    <p>{translator.translate('promptInjection.panel.disclaimer')}</p>
    {#if result}
      <p>{translator.translate('promptInjection.panel.rulesVersion', { version: result.rulesetVersion })}</p>
    {/if}
  </footer>
</section>

<style>
  .prompt-injection {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
    padding: var(--space-2);
    background: var(--color-surface);
    overflow-y: auto;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: var(--space-1) var(--space-2);
    font-size: var(--text-size-small);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  h3,
  summary {
    margin: 0;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .summary {
    margin: 0 var(--space-2);
    font-weight: 600;
  }

  .note,
  footer p {
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }

  .ignored {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
  }

  footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-start: auto;
    padding-block-start: var(--space-2);
    border-block-start: 1px solid var(--color-border);
  }

  button {
    min-height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-small);
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--color-focus);
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

  @media (forced-colors: active) {
    button {
      border-color: ButtonText;
    }
  }
</style>
