<script lang="ts">
  import {
    DEFAULT_WORKSPACE_KIND_ID,
    NOTES_KIND_ID,
    WORKSPACE_COLOURS,
    WORKSPACE_ICONS,
    type WorkspaceColour,
    type WorkspaceIcon,
    type WorkspaceKindId,
    type WorkspaceNameProblem,
  } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { NotesFolderInspection } from '@mdx/platform';
  import { untrack } from 'svelte';
  import Dialog from '../../components/Dialog.svelte';
  import { kindNameOf } from '../control-wheel/kindPresentation';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import NewWorkspacePreview from './NewWorkspacePreview.svelte';
  import NotesLocationStep from './NotesLocationStep.svelte';
  import type { NotesSetup } from './WorkspaceActions';
  import { nameProblemMessage, type WorkspaceDetails } from './workspaceCommands';
  import {
    WORKSPACE_COLOUR_NAME_KEYS,
    WORKSPACE_COLOUR_VALUES,
    WORKSPACE_ICON_NAME_KEYS,
    WORKSPACE_ICON_PATHS,
  } from './workspacePresentation';

  interface Props {
    titleKey: MessageKey;
    confirmKey: MessageKey;
    initialName: string;
    /** The kinds a new workspace can have; a rename passes the workspace's own kind only. */
    kindIds: readonly WorkspaceKindId[];
    initialKindId: WorkspaceKindId;
    initialIcon?: WorkspaceIcon | undefined;
    initialColour?: WorkspaceColour | undefined;
    checkName: (name: string, kindId: WorkspaceKindId) => WorkspaceNameProblem | undefined;
    /** A new workspace also gets an icon, a colour and, for the Markdown viewer, a first folder. */
    hasAppearanceChoices?: boolean;
    /** Suggests and checks the folder of a new Notes workspace. */
    notesSetup?: NotesSetup | undefined;
    onPickFolder?: (() => Promise<string | undefined>) | undefined;
    onInspectNotesFolder?: ((path: string) => Promise<NotesFolderInspection>) | undefined;
    translator: Translator;
    onConfirm: (details: WorkspaceDetails) => void;
    onClose: () => void;
  }

  const {
    titleKey,
    confirmKey,
    initialName,
    kindIds,
    initialKindId,
    initialIcon,
    initialColour,
    checkName,
    hasAppearanceChoices = false,
    notesSetup,
    onPickFolder = () => Promise.resolve(undefined),
    onInspectNotesFolder = () => Promise.resolve('empty'),
    translator,
    onConfirm,
    onClose,
  }: Props = $props();

  let name = $state(untrack(() => initialName));
  let kindId = $state(untrack(() => initialKindId));
  let icon: WorkspaceIcon | undefined = $state(untrack(() => initialIcon));
  let colour: WorkspaceColour | undefined = $state(untrack(() => initialColour));
  let isFolderStepChosen = $state(true);
  let notesLocationPath: string | undefined = $state();
  let hasTriedToConfirm = $state(false);
  let input: HTMLInputElement | undefined = $state();

  const problem = $derived(checkName(name, kindId));
  const isNotesStepShown = $derived(
    hasAppearanceChoices && kindId === NOTES_KIND_ID && notesSetup !== undefined,
  );
  const shownProblem = $derived(
    problem && (hasTriedToConfirm || name.length > 0) ? nameProblemMessage(problem, kindId, translator) : '',
  );

  /** Selecting the whole name lets a rename replace it by typing. */
  $effect(() => {
    const field = input;
    void Promise.resolve().then(() => {
      field?.focus();
      field?.select();
    });
  });

  function confirm() {
    hasTriedToConfirm = true;
    if (problem || (isNotesStepShown && notesLocationPath === undefined)) return;
    const hasFolderStep = hasAppearanceChoices && kindId === DEFAULT_WORKSPACE_KIND_ID && isFolderStepChosen;
    onConfirm({
      name: name.trim(),
      kindId,
      icon,
      colour,
      isFolderStepChosen: hasFolderStep,
      ...(isNotesStepShown ? { notesLocationPath } : {}),
    });
  }
</script>

<Dialog
  title={translator.translate(titleKey)}
  closeLabel={translator.translate('dialog.close.label')}
  closeTooltip={translator.translate('dialog.close.tooltip')}
  cancelLabel={translator.translate('workspaces.dialog.cancel')}
  primary={{ label: translator.translate(confirmKey), onActivate: confirm }}
  {onClose}
>
  <div class="fields">
    {#if hasAppearanceChoices}
      <NewWorkspacePreview {name} {kindId} {icon} {colour} {translator} />
    {/if}
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
    {#if hasAppearanceChoices}
      <fieldset class="choices">
        <legend>{translator.translate('workspaces.dialog.icon')}</legend>
        <label class="choice">
          <input type="radio" name="workspace-icon" value={undefined} bind:group={icon} />
          {translator.translate('workspaces.dialog.none')}
        </label>
        {#each WORKSPACE_ICONS as iconOption (iconOption)}
          <label class="choice" title={translator.translate(WORKSPACE_ICON_NAME_KEYS[iconOption])}>
            <input type="radio" name="workspace-icon" value={iconOption} bind:group={icon} />
            <KindIcon paths={WORKSPACE_ICON_PATHS[iconOption]} />
            <span class="visually-hidden">{translator.translate(WORKSPACE_ICON_NAME_KEYS[iconOption])}</span>
          </label>
        {/each}
      </fieldset>
      <fieldset class="choices">
        <legend>{translator.translate('workspaces.dialog.colour')}</legend>
        <label class="choice">
          <input type="radio" name="workspace-colour" value={undefined} bind:group={colour} />
          {translator.translate('workspaces.dialog.none')}
        </label>
        {#each WORKSPACE_COLOURS as colourOption (colourOption)}
          <label class="choice">
            <input type="radio" name="workspace-colour" value={colourOption} bind:group={colour} />
            <span class="swatch" style:background={WORKSPACE_COLOUR_VALUES[colourOption]}></span>
            {translator.translate(WORKSPACE_COLOUR_NAME_KEYS[colourOption])}
          </label>
        {/each}
      </fieldset>
      {#if isNotesStepShown && notesSetup}
        <NotesLocationStep
          setup={notesSetup}
          workspaceName={name}
          {translator}
          {onPickFolder}
          onInspectFolder={onInspectNotesFolder}
          {hasTriedToConfirm}
          bind:locationPath={notesLocationPath}
        />
      {/if}
      {#if kindId === DEFAULT_WORKSPACE_KIND_ID}
        <label class="folder-step">
          <input type="checkbox" bind:checked={isFolderStepChosen} />
          {translator.translate('workspaces.dialog.addFolder')}
        </label>
      {/if}
    {/if}
  </div>
</Dialog>

<style>
  .fields {
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

  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }

  legend {
    margin-block-end: var(--space-1);
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }

  .choice,
  .folder-step {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .choice input,
  .folder-step input {
    height: auto;
  }

  .swatch {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  input[aria-invalid='true'] {
    border-color: var(--color-alert-caution);
  }

  .problem {
    min-height: 1.2em;
    margin: 0;
    font-size: var(--text-size-small);
  }

  :is(input, select):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
