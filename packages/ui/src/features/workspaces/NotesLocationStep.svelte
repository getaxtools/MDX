<script lang="ts">
  import { defaultNotesLocationPath, isSyncedFolder, locationClaimProblem } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { NotesFolderInspection } from '@mdx/platform';
  import type { NotesSetup } from './WorkspaceActions';

  interface Props {
    setup: NotesSetup;
    /** The name typed so far, which names the default folder of a later Notes workspace. */
    workspaceName: string;
    translator: Translator;
    /** Opens the folder picker; undefined when the user cancels. */
    onPickFolder: () => Promise<string | undefined>;
    /** What the folder holds, so one that already has files is used only after the user agrees. */
    onInspectFolder: (path: string) => Promise<NotesFolderInspection>;
    /** Create was pressed, so a missing agreement is said out loud instead of doing nothing. */
    hasTriedToConfirm?: boolean;
    /** The folder the workspace will use, or undefined while none can be used. */
    locationPath: string | undefined;
  }

  let {
    setup,
    workspaceName,
    translator,
    onPickFolder,
    onInspectFolder,
    hasTriedToConfirm = false,
    locationPath = $bindable(),
  }: Props = $props();

  let chosenPath: string | undefined = $state();
  let inspected: { readonly path: string; readonly inspection: NotesFolderInspection } | undefined = $state();
  /** Agreeing to use a folder with files counts for that folder only, never for the next one shown. */
  let agreedPath: string | undefined = $state();

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
  const inspection = $derived(inspected?.path === shownPath ? inspected?.inspection : undefined);
  const hasAgreed = $derived(agreedPath !== undefined && agreedPath === shownPath);

  $effect(() => {
    const path = shownPath;
    if (path === undefined) return;
    let isCurrent = true;
    // A folder that cannot be looked into is treated as holding files, so it is never used unasked.
    void onInspectFolder(path).then(
      (result) => {
        if (isCurrent) inspected = { path, inspection: result };
      },
      () => {
        if (isCurrent) inspected = { path, inspection: 'existingFiles' };
      },
    );
    return () => {
      isCurrent = false;
    };
  });

  $effect(() => {
    locationPath = isUsable(inspection) ? shownPath : undefined;
  });

  function isUsable(shownInspection: NotesFolderInspection | undefined): boolean {
    if (claimProblem !== undefined || shownInspection === undefined || shownInspection === 'refused')
      return false;
    return shownInspection !== 'existingFiles' || hasAgreed;
  }

  async function chooseFolder() {
    const picked = await onPickFolder();
    if (picked !== undefined) chosenPath = picked;
  }
</script>

<div
  class="notes-location"
  role="group"
  aria-labelledby="notes-location-label"
  aria-busy={shownPath !== undefined && inspection === undefined}
>
  <span id="notes-location-label" class="label">{translator.translate('workspaces.notes.locationLabel')}</span
  >
  {#if shownPath === undefined}
    <p class="problem" role="alert">{translator.translate('workspaces.notes.noDocuments')}</p>
  {:else}
    <code class="path">{shownPath}</code>
  {/if}
  {#if claimProblem}
    <p class="problem" role="alert">{translator.translate(`workspaces.notes.claim.${claimProblem}`)}</p>
  {:else if inspection === 'refused'}
    <p class="problem" role="alert">{translator.translate('workspaces.notes.refusedPlace')}</p>
  {:else}
    {#if inspection === 'existingFiles'}
      <p class="notice" id="notes-existing-files">{translator.translate('workspaces.notes.existingFiles')}</p>
      <label class="agreement">
        <input
          type="checkbox"
          aria-describedby="notes-existing-files"
          checked={hasAgreed}
          onchange={(event) => (agreedPath = event.currentTarget.checked ? shownPath : undefined)}
        />
        {translator.translate('workspaces.notes.useExistingFiles')}
      </label>
      {#if hasTriedToConfirm && !hasAgreed}
        <p class="problem" role="alert">{translator.translate('workspaces.notes.agreementNeeded')}</p>
      {/if}
    {:else if inspection === 'notesLocation'}
      <p class="notice">{translator.translate('workspaces.notes.alreadyNotesFolder')}</p>
    {/if}
    {#if isSynced}
      <p class="notice">{translator.translate('workspaces.notes.syncedNotice')}</p>
    {/if}
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

  .agreement {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    font-size: var(--text-size-small);
  }

  .agreement input:focus-visible {
    outline: 2px solid var(--color-focus);
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
