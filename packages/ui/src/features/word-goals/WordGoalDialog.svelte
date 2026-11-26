<script lang="ts">
  import { isValidWordGoal } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    /** The active document's goal, if it has one. */
    currentGoal: number | undefined;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { currentGoal, translator, onCommand, onClose }: Props = $props();

  let goalText = $state(untrack(() => (currentGoal === undefined ? '' : String(currentGoal))));
  let isInvalid = $state(false);

  function setGoal() {
    const goal = Number(goalText.trim());
    isInvalid = !isValidWordGoal(goal);
    if (!isInvalid) onCommand({ kind: 'setWordGoal', goal });
  }
</script>

<Dialog
  title={translator.translate('wordGoal.title')}
  closeLabel={translator.translate('dialog.close.label')}
  closeTooltip={translator.translate('dialog.close.tooltip')}
  cancelLabel={translator.translate('wordGoal.cancel')}
  primary={{ label: translator.translate('wordGoal.save'), onActivate: setGoal }}
  {onClose}
>
  <div class="fields">
    <label for="word-goal">{translator.translate('wordGoal.label')}</label>
    <input
      bind:value={goalText}
      id="word-goal"
      inputmode="numeric"
      aria-invalid={isInvalid}
      aria-describedby="word-goal-description word-goal-error"
    />
    <p id="word-goal-description" class="description">{translator.translate('wordGoal.description')}</p>
    <p id="word-goal-error" class="error" role="alert">
      {isInvalid ? translator.translate('wordGoal.invalid') : ''}
    </p>
  </div>
  {#snippet footer()}
    {#if currentGoal !== undefined}
      <button type="button" onclick={() => onCommand({ kind: 'clearWordGoal' })}>
        {translator.translate('wordGoal.clear')}
      </button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .fields {
    display: grid;
    gap: var(--space-2);
  }

  input {
    height: 32px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  input[aria-invalid='true'] {
    border-color: var(--color-alert-caution);
  }

  .description,
  .error {
    margin: 0;
    font-size: var(--text-size-small);
  }

  .description {
    color: var(--color-text-secondary);
  }

  button {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 500;
    transition: background-color var(--motion-fast) ease-out;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  :is(input, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
