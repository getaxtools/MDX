<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { checkShortcutChange, type ShortcutRefusal } from '../shortcuts/checkShortcutChange';
  import { shortcutFor, shortcutLabelFor, type CommandShortcut } from '../shortcuts/commandShortcuts';
  import { describeCombination, type KeyCombination } from '../shortcuts/describeCombination';
  import { recordedCombination } from '../shortcuts/recordedCombination';
  import type { DesktopPlatform, ViewerCommand } from '../viewer/viewerCommands';
  import type { ShortcutKeysSetting } from './settingDefinitions';

  interface Props {
    setting: ShortcutKeysSetting;
    /** The keys each command has now, including the user's changes. */
    shortcuts: readonly CommandShortcut[];
    platform: DesktopPlatform;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { setting, shortcuts, platform, translator, onCommand }: Props = $props();

  const REFUSAL_MESSAGES: Readonly<Record<ShortcutRefusal['reason'], MessageKey>> = {
    usedBy: 'settings.shortcut.refused.usedBy',
    needsModifier: 'settings.shortcut.refused.needsModifier',
    altMenuKey: 'settings.shortcut.refused.altMenuKey',
    notAllowed: 'settings.shortcut.refused.notAllowed',
  };

  let isRecording = $state(false);
  let message = $state('');
  /** A button clicks when Space comes up, which would start recording again after Space was refused. */
  let isKeyUpToSwallow = false;

  const rowId = $derived(`setting-${setting.id}`);
  const combinations = $derived(shortcutFor(setting.command, shortcuts)?.combinations ?? []);
  const shortcutLabel = $derived(shortcutLabelFor(setting.command, translator, shortcuts));

  function startRecording() {
    message = translator.translate('settings.shortcut.recording');
    isRecording = true;
  }

  function stopRecording(shownMessage = '') {
    message = shownMessage;
    isRecording = false;
  }

  /** While recording, every key belongs to the recorder, so no shortcut or dialog key runs. */
  function record(event: KeyboardEvent) {
    if (!isRecording) return;
    event.preventDefault();
    event.stopPropagation();
    isKeyUpToSwallow = true;
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      stopRecording();
      return;
    }
    const combination = recordedCombination(event, platform);
    if (combination) applyRecorded(combination);
  }

  function applyRecorded(combination: KeyCombination) {
    const keys = describeCombination(combination, translator);
    const check = checkShortcutChange(combination, setting.commandId, shortcuts);
    if (!check.isAccepted) {
      stopRecording(refusalMessage(check.refusal, keys));
      return;
    }
    onCommand({ kind: 'setShortcut', commandId: setting.commandId, combination });
    stopRecording(
      check.hasKeyboardWarning ? translator.translate('settings.shortcut.keyboardWarning', { keys }) : '',
    );
  }

  function refusalMessage(refusal: ShortcutRefusal, keys: string): string {
    const action =
      refusal.reason === 'usedBy' ? translator.translate(refusal.actionKey).replace('…', '') : '';
    return translator.translate(REFUSAL_MESSAGES[refusal.reason], { keys, action });
  }

  function swallowRecordedKeyUp(event: KeyboardEvent) {
    if (!isKeyUpToSwallow) return;
    isKeyUpToSwallow = false;
    event.preventDefault();
  }

  function removeShortcut() {
    stopRecording();
    onCommand({ kind: 'removeShortcut', commandId: setting.commandId });
  }

  function resetShortcut() {
    stopRecording();
    onCommand({ kind: 'resetShortcut', commandId: setting.commandId });
  }
</script>

<div class="setting" role="group" aria-labelledby="{rowId}-label" aria-describedby="{rowId}-description">
  <span id="{rowId}-label" class="label">{translator.translate(setting.labelKey)}</span>
  <span class="keys">
    {#each combinations as combination, index (index)}
      <kbd>{describeCombination(combination, translator)}</kbd>
    {:else}
      {translator.translate('shortcuts.none')}
    {/each}
  </span>
  <p id="{rowId}-description" class="description">{translator.translate(setting.descriptionKey)}</p>
  <div class="actions">
    <button
      aria-pressed={isRecording}
      onclick={startRecording}
      onkeydown={record}
      onkeyup={swallowRecordedKeyUp}
      onblur={() => {
        if (isRecording) stopRecording();
      }}
    >
      {translator.translate('settings.shortcut.change')}
    </button>
    <button onclick={removeShortcut}>{translator.translate('settings.shortcut.remove')}</button>
    <button onclick={resetShortcut}>{translator.translate('settings.shortcut.reset')}</button>
  </div>
  <p class="message" role="status">{message}</p>
  {#if setting.hasMouseButtonHelp}
    <p class="description">
      {shortcutLabel
        ? translator.translate('help.controlWheel.mouseButton', { shortcut: shortcutLabel })
        : translator.translate('help.controlWheel.mouseButtonWithoutShortcut')}
    </p>
  {/if}
</div>

<style>
  .setting {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 var(--space-4);
    align-items: center;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .description,
  .actions,
  .message {
    grid-column: 1 / -1;
  }

  .description {
    margin: var(--space-1) 0 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .message {
    margin: 0;
    font-size: var(--text-size-small);
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

  button:hover {
    background: var(--color-surface-hover);
  }

  button[aria-pressed='true'] {
    border-color: var(--color-focus);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  kbd {
    padding: 0 var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xsmall);
    background: var(--color-surface);
    box-shadow: inset 0 -1px 0 var(--color-border);
    font-family: var(--font-ui);
    font-size: var(--text-size-small);
    white-space: nowrap;
  }
</style>
