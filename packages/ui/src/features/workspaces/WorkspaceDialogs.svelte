<script lang="ts">
  import {
    DEFAULT_WORKSPACE_KIND_ID,
    isBuiltKind,
    type WorkspaceKindId,
    type WorkspaceKindsState,
  } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { WorkspacesView } from '../viewer/ViewerController';
  import type { WorkspaceDialog } from './WorkspaceActions';
  import { workspaceNameOf } from './workspaceCommands';
  import WorkspaceNameDialog from './WorkspaceNameDialog.svelte';

  interface Props {
    dialog: WorkspaceDialog;
    workspaces: WorkspacesView;
    kinds: WorkspaceKindsState;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { dialog, workspaces, kinds, translator, onCommand, onClose }: Props = $props();

  const shown = $derived(workspaces.registry.find(workspaces.shownWorkspaceId));
  const choosableKindIds = $derived(
    kinds.enabledKindIds().filter((kindId) => isBuiltKind(kinds.kinds(), kindId)),
  );
  const newWorkspaceKindId = $derived(
    workspaces.kindForNewWorkspace ?? choosableKindIds[0] ?? DEFAULT_WORKSPACE_KIND_ID,
  );
  const shownKindId = $derived((shown?.kindId ?? DEFAULT_WORKSPACE_KIND_ID) as WorkspaceKindId);
</script>

{#if dialog === 'newWorkspace'}
  <WorkspaceNameDialog
    titleKey="workspaces.newDialog.title"
    confirmKey="workspaces.newDialog.create"
    initialName=""
    kindIds={choosableKindIds}
    initialKindId={newWorkspaceKindId}
    checkName={(name: string, kindId: WorkspaceKindId) => workspaces.registry.checkName(name, kindId)}
    {translator}
    onConfirm={(name: string, kindId: WorkspaceKindId) =>
      onCommand({ kind: 'createWorkspace', name, kindId })}
    {onClose}
  />
{:else if dialog === 'renameWorkspace' && shown}
  <WorkspaceNameDialog
    titleKey="workspaces.renameDialog.title"
    confirmKey="workspaces.renameDialog.rename"
    initialName={workspaceNameOf(shown, translator)}
    kindIds={[shownKindId]}
    initialKindId={shownKindId}
    checkName={(name: string, kindId: WorkspaceKindId) =>
      workspaces.registry.checkName(name, kindId, shown.id)}
    {translator}
    onConfirm={(name: string) => onCommand({ kind: 'renameWorkspace', name })}
    {onClose}
  />
{:else if dialog === 'deleteWorkspace' && shown}
  <ConfirmDialog
    title={translator.translate('workspaces.deleteDialog.title', {
      name: workspaceNameOf(shown, translator),
    })}
    message={translator.translate('workspaces.deleteDialog.message')}
    confirmLabel={translator.translate('workspaces.deleteDialog.confirm')}
    cancelLabel={translator.translate('workspaces.deleteDialog.cancel')}
    onConfirm={() => onCommand({ kind: 'deleteWorkspace' })}
    onCancel={onClose}
  />
{/if}
