<script lang="ts">
  import type { WorkspaceKindId } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import { kindNameOf } from '../control-wheel/kindPresentation';
  import type { PendingWorkspaceFile } from './WorkspaceFileActions';

  interface Props {
    pending: PendingWorkspaceFile;
    translator: Translator;
    onOpen: () => void;
    onCancel: () => void;
  }

  const { pending, translator, onOpen, onCancel }: Props = $props();

  const kind = $derived(kindNameOf(pending.workspace.kindId as WorkspaceKindId, translator));
  /** Everything confirming makes readable: the folders, then favourites that are not inside them. */
  const readablePaths = $derived([
    ...pending.workspace.roots.map((root) => root.displayPath),
    ...pending.workspace.favourites.map((favourite) => favourite.location.displayPath),
  ]);
</script>

<Dialog
  title={translator.translate('workspaces.fileDialog.title', { name: pending.workspace.name })}
  closeLabel={translator.translate('workspaces.fileDialog.cancel')}
  onClose={onCancel}
>
  <p>{translator.translate('workspaces.fileDialog.kind', { kind })}</p>
  {#if readablePaths.length === 0}
    <p>{translator.translate('workspaces.fileDialog.nothingReadable')}</p>
  {:else}
    <p id="workspace-file-readable">{translator.translate('workspaces.fileDialog.readable')}</p>
    <ul aria-labelledby="workspace-file-readable">
      {#each readablePaths as path (path)}
        <li>{path}</li>
      {/each}
    </ul>
  {/if}
  <div class="actions">
    <button type="button" onclick={onOpen}>
      {pending.isKindDisabled
        ? translator.translate('workspaces.fileDialog.enableAndOpen', { kind })
        : translator.translate('workspaces.fileDialog.open')}
    </button>
    <button type="button" onclick={onCancel}>{translator.translate('workspaces.fileDialog.cancel')}</button>
  </div>
</Dialog>

<style>
  p {
    margin: 0 0 var(--space-2);
  }

  ul {
    max-height: 12rem;
    margin: 0 0 var(--space-3);
    padding-inline-start: var(--space-4);
    overflow-y: auto;
    font-family: var(--font-mono);
    font-size: var(--text-size-small);
    overflow-wrap: anywhere;
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

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
