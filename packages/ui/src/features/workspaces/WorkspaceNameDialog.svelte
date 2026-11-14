<script lang="ts">
  import type { WorkspaceKindId, WorkspaceNameProblem } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import Dialog from '../../components/Dialog.svelte';
  import { kindNameOf } from '../control-wheel/kindPresentation';
  import { nameProblemMessage } from './workspaceCommands';

  interface Props {
    titleKey: MessageKey;
    confirmKey: MessageKey;
    initialName: string;
    /** The kinds a new workspace can have; a rename passes the workspace's own kind only. */
    kindIds: readonly WorkspaceKindId[];
    initialKindId: WorkspaceKindId;
    checkName: (name: string, kindId: WorkspaceKindId) => WorkspaceNameProblem | undefined;
    translator: Translator;
    onConfirm: (name: string, kindId: WorkspaceKindId) => void;
    onClose: () => void;
  }

  const {
    titleKey,
    confirmKey,
    initialName,
    kindIds,
    initialKindId,
    checkName,
    translator,
    onConfirm,
    onClose,
  }: Props = $props();

  let name = $state(untrack(() => initialName));
  let kindId = $state(untrack(() => initialKindId));
  let hasTriedToConfirm = $state(false);
  let input: HTMLInputElement | undefined = $state();

  const problem = $derived(checkName(name, kindId));
  const shownProblem = $derived(
    problem && (hasTriedToConfirm || name.length > 0) ? nameProblemMessage(problem, kindId, translator) : '',
  );

  /** After the dialog has focused its close button, the name field takes the focus. */
  $effect(() => {
    const field = input;
    void Promise.resolve().then(() => {
      field?.focus();
      field?.select();
    });
  });

  function confirm(event: SubmitEvent) {
    event.preventDefault();
    hasTriedToConfirm = true;
    if (!problem) onConfirm(name.trim(), kindId);
  }
</script>

<Dialog
  title={translator.translate(titleKey)}
  closeLabel={translator.translate('workspaces.dialog.cancel')}
  {onClose}
>
  <form onsubmit={confirm}>
    <label for="workspace-name">{translator.translate('workspaces.dialog.name')}</label>
    <input
      bind:this={input}
      bind:value={name}
      id="workspace-name"
      autocomplete="off"
      aria-invalid={shownProblem !== ''}
      aria-describedby="workspace-name-problem"
    />
    <p id="workspace-name-problem" class="problem" role="alert">{shownProblem}</p>
    {#if kindIds.length > 1}
      <label for="workspace-kind">{translator.translate('workspaces.dialog.kind')}</label>
      <select id="workspace-kind" bind:value={kindId}>
        {#each kindIds as optionKindId (optionKindId)}
          <option value={optionKindId}>{kindNameOf(optionKindId, translator)}</option>
        {/each}
      </select>
    {/if}
    <div class="actions">
      <button type="submit">{translator.translate(confirmKey)}</button>
      <button type="button" onclick={onClose}>{translator.translate('workspaces.dialog.cancel')}</button>
    </div>
  </form>
</Dialog>

<style>
  form {
    display: grid;
    gap: var(--space-2);
    min-width: 320px;
  }

  input,
  select {
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

  .problem {
    min-height: 1.2em;
    margin: 0;
    font-size: var(--text-size-small);
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

  :is(input, select, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
