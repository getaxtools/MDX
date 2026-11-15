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
  import { workspaceNameOf, type WorkspaceDetails } from './workspaceCommands';
  import WorkspaceNameDialog from './WorkspaceNameDialog.svelte';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import WorkspaceFileConfirmation from './WorkspaceFileConfirmation.svelte';

  interface Props {
    dialog: WorkspaceDialog;
    workspaces: WorkspacesView;
    kinds: WorkspaceKindsState;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
    onPickFolder?: () => Promise<string | undefined>;
  }

  const { dialog, workspaces, kinds, translator, onCommand, onClose, onPickFolder }: Props = $props();

  const shown = $derived(workspaces.registry.find(workspaces.shownWorkspaceId));
  const choosableKindIds = $derived(
    kinds.enabledKindIds().filter((kindId) => isBuiltKind(kinds.kinds(), kindId)),
  );
  const newWorkspaceKindId = $derived(
    workspaces.kindForNewWorkspace ?? choosableKindIds[0] ?? DEFAULT_WORKSPACE_KIND_ID,
  );
  const shownKindId = $derived((shown?.kindId ?? DEFAULT_WORKSPACE_KIND_ID) as WorkspaceKindId);
</script>

{#if dialog === 'openWorkspaceFile' && workspaces.pendingFile}
  <WorkspaceFileConfirmation
    pending={workspaces.pendingFile}
    {translator}
    onOpen={() => onCommand({ kind: 'confirmOpenWorkspaceFile' })}
    onCancel={() => onCommand({ kind: 'cancelOpenWorkspaceFile' })}
  />
{:else if dialog === 'workspaceSwitcher'}
  <WorkspaceSwitcher
    source={{ registry: workspaces.registry, shownWorkspaceId: workspaces.shownWorkspaceId, kinds }}
    {translator}
    onSwitch={(workspaceId: string) => onCommand({ kind: 'switchWorkspace', workspaceId })}
    {onClose}
  />
{:else if dialog === 'newWorkspace'}
  <WorkspaceNameDialog
    titleKey="workspaces.newDialog.title"
    confirmKey="workspaces.newDialog.create"
    initialName={workspaces.newWorkspaceFromFile?.name ?? ''}
    initialIcon={workspaces.newWorkspaceFromFile?.icon}
    initialColour={workspaces.newWorkspaceFromFile?.colour}
    kindIds={workspaces.newWorkspaceFromFile ? [newWorkspaceKindId] : choosableKindIds}
    initialKindId={newWorkspaceKindId}
    checkName={(name: string, kindId: WorkspaceKindId) => workspaces.registry.checkName(name, kindId)}
    {translator}
    hasAppearanceChoices
    notesSetup={workspaces.notesSetup}
    {onPickFolder}
    onConfirm={(details: WorkspaceDetails) => onCommand({ kind: 'createWorkspace', ...details })}
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
    onConfirm={({ name }: WorkspaceDetails) => onCommand({ kind: 'renameWorkspace', name })}
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
