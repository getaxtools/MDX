<script lang="ts">
  import { defaultNotesLocationPath, isSyncedFolder, locationClaimProblem } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { NotesSetup } from './WorkspaceActions';

  interface Props {
    setup: NotesSetup;
    /** The name typed so far, which names the default folder of a later Notes workspace. */
    workspaceName: string;
    translator: Translator;
    /** Opens the folder picker; undefined when the user cancels. */
    onPickFolder: () => Promise<string | undefined>;
    /** The folder the workspace will use, or undefined while none can be used. */
    locationPath: string | undefined;
  }

  let { setup, workspaceName, translator, onPickFolder, locationPath = $bindable() }: Props = $props();

  let chosenPath: string | undefined = $state();

  const defaultPath = $derived(
    setup.documents === undefined
      ? undefined
      : defaultNotesLocationPath(setup.documents, {
          workspaceName: workspaceName.trim(),
          isFirstNotesWorkspace: setup.claimedPaths.length === 0,
        }),
  );
  const shownPath = $derived(chosenPath ?? defaultPath);
  const claimProblem = $derived(
    shownPath === undefined ? undefined : locationClaimProblem(shownPath, setup.claimedPaths),
  );
  const isSynced = $derived(shownPath !== undefined && isSyncedFolder(shownPath, setup.syncedFolders));

  $effect(() => {
    locationPath = claimProblem === undefined ? shownPath : undefined;
  });

  async function chooseFolder() {
    const picked = await onPickFolder();
    if (picked !== undefined) chosenPath = picked;
  }
</script>

<div class="notes-location" role="group" aria-labelledby="notes-location-label">
  <span id="notes-location-label" class="label">{translator.translate('workspaces.notes.locationLabel')}</span
  >
  {#if shownPath === undefined}
    <p class="problem" role="alert">{translator.translate('workspaces.notes.noDocuments')}</p>
  {:else}
    <code class="path">{shownPath}</code>
  {/if}
  {#if claimProblem}
    <p class="problem" role="alert">{translator.translate(`workspaces.notes.claim.${claimProblem}`)}</p>
  {:else if isSynced}
    <p class="notice">{translator.translate('workspaces.notes.syncedNotice')}</p>
  {/if}
  <div class="actions">
    <button type="button" onclick={() => void chooseFolder()}>
      {translator.translate('workspaces.notes.choose')}
    </button>
    {#if chosenPath !== undefined && defaultPath !== undefined}
      <button type="button" onclick={() => (chosenPath = undefined)}>
        {translator.translate('workspaces.notes.useDefault')}
      </button>
    {/if}
  </div>
</div>

<style>
  .notes-location {
    display: grid;
    gap: var(--space-1);
  }

  .path {
    font-family: var(--font-mono);
    font-size: var(--text-size-small);
    overflow-wrap: anywhere;
  }

  .notice,
  .problem {
    margin: 0;
    font-size: var(--text-size-small);
  }

  .notice {
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  button {
    height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
