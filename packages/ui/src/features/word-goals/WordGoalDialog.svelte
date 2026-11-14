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
  let input: HTMLInputElement | undefined = $state();

  $effect(() => input?.focus());

  function setGoal(event: SubmitEvent) {
    event.preventDefault();
    const goal = Number(goalText.trim());
    isInvalid = !isValidWordGoal(goal);
    if (!isInvalid) onCommand({ kind: 'setWordGoal', goal });
  }
</script>

<Dialog
  title={translator.translate('wordGoal.title')}
  closeLabel={translator.translate('wordGoal.cancel')}
  {onClose}
>
  <form onsubmit={setGoal}>
    <label for="word-goal">{translator.translate('wordGoal.label')}</label>
    <input
      bind:this={input}
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
    <div class="actions">
      <button type="submit">{translator.translate('wordGoal.save')}</button>
      {#if currentGoal !== undefined}
        <button type="button" onclick={() => onCommand({ kind: 'clearWordGoal' })}>
          {translator.translate('wordGoal.clear')}
        </button>
      {/if}
    </div>
  </form>
</Dialog>

<style>
  form {
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

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  button {
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  :is(input, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
