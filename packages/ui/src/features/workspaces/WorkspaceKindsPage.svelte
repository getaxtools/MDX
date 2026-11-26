<script lang="ts">
  import {
    flipKindSwitch,
    kindsPageEntriesOf,
    type KindsPageEntry,
    type KindToggleOutcome,
    type KindsPageStatus,
    type WorkspaceKindId,
    type WorkspaceKindsState,
  } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { tick } from 'svelte';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import { KIND_ICONS, kindColourOf, kindDescriptionOf, kindNameOf } from '../control-wheel/kindPresentation';
  import {
    applyWorkspaceKindCommand,
    kindShownNoticeOf,
    type WorkspaceKindCommand,
  } from '../control-wheel/workspaceKindCommands';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    kinds: WorkspaceKindsState;
    /** The current shortcut of the control wheel, if it has one. */
    controlWheelShortcut: string | undefined;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { kinds, controlWheelShortcut, translator, onCommand, onClose }: Props = $props();

  const STATUS_KEYS: Readonly<Record<KindsPageStatus, MessageKey>> = {
    active: 'workspaceKinds.page.status.active',
    on: 'workspaceKinds.page.status.on',
    off: 'workspaceKinds.page.status.off',
    later: 'workspaceKinds.availability.later',
  };

  const entries = $derived(kindsPageEntriesOf(kinds));
  let announcement = $state('');
  let chosenKindId: WorkspaceKindId | undefined = $state();

  $effect(() => {
    if (chosenKindId === undefined || kinds.activeKindId() !== chosenKindId) return;
    const notice = kindShownNoticeOf(chosenKindId, translator);
    chosenKindId = undefined;
    void announce(translator.translate(notice.key, notice.values));
  });

  function nameOf(kindId: WorkspaceKindId): string {
    return kindNameOf(kindId, translator);
  }

  async function announce(text: string | undefined) {
    if (text === undefined) return;
    announcement = '';
    await tick();
    announcement = text;
  }

  function noticeTextOf(command: WorkspaceKindCommand): string | undefined {
    const { notice } = applyWorkspaceKindCommand(kinds, command, translator);
    return notice && translator.translate(notice.key, notice.values);
  }

  function choose(kindId: WorkspaceKindId) {
    const command: WorkspaceKindCommand = { kind: 'switchWorkspaceKind', kindId };
    chosenKindId = noticeTextOf(command) === undefined ? undefined : kindId;
    onCommand(command);
  }

  function open(kindId: WorkspaceKindId) {
    onClose();
    onCommand({ kind: 'switchWorkspaceKind', kindId });
  }

  function flipSwitch(entry: KindsPageEntry) {
    const { outcome } = flipKindSwitch(kinds, entry.kindId);
    const command: WorkspaceKindCommand = {
      kind: 'setWorkspaceKindEnabled',
      kindId: entry.kindId,
      isEnabled: outcome === 'enabled',
    };
    void announce(switchAnnouncementOf(outcome, entry.kindId, command));
    if (outcome === 'enabled' || outcome === 'disabled' || outcome === 'disabledActive') onCommand(command);
  }

  function switchAnnouncementOf(
    outcome: KindToggleOutcome,
    kindId: WorkspaceKindId,
    command: WorkspaceKindCommand,
  ): string | undefined {
    const kind = nameOf(kindId);
    if (outcome === 'enabled') return translator.translate('workspaceKinds.page.turnedOn', { kind });
    if (outcome === 'disabled') return translator.translate('workspaceKinds.page.turnedOff', { kind });
    return noticeTextOf(command);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    onClose();
  }
</script>

<!-- Esc leaves the page from any control on it, so the landmark listens for the key. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main class="kinds-page" tabindex="-1" aria-labelledby="kinds-page-heading" onkeydown={handleKeydown}>
  <h1 id="kinds-page-heading">{translator.translate('workspaceKinds.page.title')}</h1>
  <p class="introduction">{translator.translate('workspaceKinds.page.introduction')}</p>
  <ul class="cards" aria-label={translator.translate('workspaceKinds.page.kinds')}>
    {#each entries as entry (entry.kindId)}
      {@const kind = nameOf(entry.kindId)}
      {@const nameId = `kind-card-${entry.kindId}-name`}
      {@const descriptionId = `kind-card-${entry.kindId}-description`}
      {@const reasonId = `kind-card-${entry.kindId}-reason`}
      {@const isLocked = entry.switchState === 'lockedOn'}
      <li
        class="card"
        class:planned={entry.status === 'later'}
        aria-labelledby={nameId}
        style:--kind-colour={kindColourOf(entry.kindId)}
      >
        <button
          class="choose"
          aria-pressed={entry.status === 'active'}
          aria-describedby={descriptionId}
          disabled={!entry.canBeChosen}
          onclick={() => choose(entry.kindId)}
        >
          <span class="preview" aria-hidden="true"><KindIcon paths={KIND_ICONS[entry.kindId]} /></span>
          <span id={nameId} class="name">{kind}</span>
        </button>
        <p id={descriptionId} class="description">{kindDescriptionOf(entry.kindId, translator)}</p>
        <div class="footer">
          <span class="status">{translator.translate(STATUS_KEYS[entry.status])}</span>
          {#if entry.status !== 'later'}
            <button class="open" disabled={!entry.canBeChosen} onclick={() => open(entry.kindId)}>
              {translator.translate('workspaceKinds.page.open', { kind })}
            </button>
          {/if}
          {#if entry.switchState !== 'none'}
            <span class="switch-area">
              <button
                class="switch"
                role="switch"
                aria-checked={entry.switchState !== 'off'}
                aria-disabled={isLocked}
                aria-describedby={isLocked ? reasonId : undefined}
                onclick={() => flipSwitch(entry)}
              >
                <span class="visually-hidden"
                  >{translator.translate('workspaceKinds.page.switch', { kind })}</span
                >
                <span class="track" aria-hidden="true"></span>
              </button>
              {#if isLocked}
                <span id={reasonId} class="reason" role="tooltip">
                  {translator.translate('workspaceKinds.notice.lastEnabled')}
                </span>
              {/if}
            </span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  <div class="actions">
    <button class="action" onclick={() => onCommand({ kind: 'toggleControlWheel' })}>
      {translator.translate('workspaceKinds.page.showControlWheel')}
      {#if controlWheelShortcut}<kbd>{controlWheelShortcut}</kbd>{/if}
    </button>
    <button class="action" onclick={() => onCommand({ kind: 'showSettings' })}>
      {translator.translate('settings.title')}
    </button>
  </div>
  <p class="tip">
    {controlWheelShortcut
      ? translator.translate('workspaceKinds.page.mouseButtonTip', { shortcut: controlWheelShortcut })
      : translator.translate('workspaceKinds.page.mouseButtonTipWithoutShortcut')}
  </p>
  <p class="visually-hidden" role="status">{announcement}</p>
</main>

<style>
  .kinds-page {
    box-sizing: border-box;
    height: 100%;
    overflow: auto;
    padding: var(--space-8) var(--space-6);
    color: var(--color-text);
  }

  h1 {
    margin: 0 0 var(--space-2);
    font-size: 1.75rem;
    font-weight: 600;
  }

  .introduction,
  .description,
  .tip {
    color: var(--color-text-secondary);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: var(--space-4);
    margin: var(--space-6) 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-large);
  }

  .card.planned .preview {
    opacity: 0.5;
    filter: grayscale(1);
  }

  .choose {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-medium);
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
  }

  .choose[aria-pressed='true'] {
    border-color: var(--kind-colour);
  }

  .preview {
    color: var(--kind-colour);
  }

  .name {
    font-weight: 600;
  }

  .description {
    margin: 0;
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .status {
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-full);
    font-size: var(--text-size-small);
  }

  .open,
  .action {
    min-block-size: 2rem;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-full);
    background: none;
    color: inherit;
    font: inherit;
  }

  .switch-area {
    position: relative;
    margin-inline-start: auto;
  }

  .switch {
    display: flex;
    align-items: center;
    min-block-size: 1.5rem;
    padding: 0;
    border: 0;
    background: none;
  }

  .switch[aria-disabled='true'] {
    cursor: not-allowed;
  }

  .switch[aria-disabled='true'] .track {
    opacity: 0.6;
  }

  .track {
    --track-height: 1.25rem;
    --knob-size: 0.75rem;
    --knob-gap: calc((var(--track-height) - var(--knob-size)) / 2);

    position: relative;
    display: block;
    width: 2.25rem;
    height: var(--track-height);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-full);
  }

  .track::after {
    content: '';
    position: absolute;
    inset-block-start: var(--knob-gap);
    inset-inline-start: var(--knob-gap);
    width: var(--knob-size);
    height: var(--knob-size);
    border-radius: 50%;
    background: var(--color-text-secondary);
  }

  .switch[aria-checked='true'] .track {
    border-color: var(--color-accent);
    background: var(--color-accent);
  }

  .switch[aria-checked='true'] .track::after {
    inset-inline-start: calc(100% - var(--knob-size) - var(--knob-gap));
    background: var(--color-accent-text);
  }

  .reason {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-end: 0;
    z-index: 1;
    inline-size: max-content;
    max-inline-size: 14rem;
    display: none;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    font-size: var(--text-size-small);
  }

  .switch-area:hover .reason,
  .switch:focus-visible + .reason {
    display: block;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  kbd {
    margin-inline-start: var(--space-2);
    font: inherit;
    color: var(--color-text-secondary);
  }

  button:disabled {
    color: var(--color-text-secondary);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: no-preference) {
    .track::after {
      transition: inset-inline-start var(--motion-fast) ease-out;
    }
  }

  @media (forced-colors: active) {
    .card,
    .status {
      border-color: CanvasText;
    }

    .track {
      border-color: ButtonText;
    }

    .track::after {
      background: ButtonText;
    }

    .switch[aria-checked='true'] .track {
      border-color: Highlight;
      background: Highlight;
    }

    .switch[aria-checked='true'] .track::after {
      background: HighlightText;
    }

    .choose[aria-pressed='true'] {
      border-color: Highlight;
    }

    .switch[aria-disabled='true'] .track {
      border-color: GrayText;
      background: GrayText;
      opacity: 1;
    }

    button:disabled,
    .switch[aria-disabled='true'] {
      color: GrayText;
    }
  }
</style>
