<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import { isRecoveryKeyConfirmed, passwordProblemOf, type PasswordProblem } from './protectedPasswords';

  interface Props {
    /** Present once the section is set up, until the user typed its end back. */
    recoveryKey?: string | undefined;
    /** The section locked before the key was confirmed; it shows again once the section is unlocked. */
    isRecoveryKeyCovered?: boolean;
    problem?: MessageKey | undefined;
    isBusy: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const {
    recoveryKey,
    isRecoveryKeyCovered = false,
    problem,
    isBusy,
    translator,
    onCommand,
    onClose,
  }: Props = $props();

  const PASSWORD_PROBLEMS: Record<PasswordProblem, MessageKey> = {
    tooShort: 'protectedNotes.setUp.tooShort',
    mismatch: 'protectedNotes.setUp.mismatch',
  };

  let hasReadWarning = $state(false);
  let password = $state('');
  let repeatedPassword = $state('');
  let passwordProblem: PasswordProblem | undefined = $state();
  let typedEnd = $state('');
  let isEndWrong = $state(false);
  let firstField: HTMLInputElement | undefined = $state();

  $effect(() => firstField?.focus());

  let wasBusy = false;
  $effect(() => {
    if (wasBusy && !isBusy && recoveryKey === undefined) firstField?.focus();
    wasBusy = isBusy;
  });

  const passwordMessageKey = $derived(passwordProblem ? PASSWORD_PROBLEMS[passwordProblem] : problem);

  function setUp() {
    passwordProblem = passwordProblemOf(password, repeatedPassword);
    if (passwordProblem) return;
    onCommand({ kind: 'setUpProtectedSection', password });
    password = '';
    repeatedPassword = '';
  }

  function finish() {
    isEndWrong = recoveryKey === undefined || !isRecoveryKeyConfirmed(recoveryKey, typedEnd);
    typedEnd = '';
    if (!isEndWrong) onCommand({ kind: 'finishProtectedSetUp' });
  }

  const primary = $derived.by(() => {
    if (isRecoveryKeyCovered) return undefined;
    if (recoveryKey !== undefined) {
      return { label: translator.translate('protectedNotes.setUp.finish'), onActivate: finish };
    }
    if (!hasReadWarning) {
      return {
        label: translator.translate('protectedNotes.setUp.continue'),
        onActivate: () => (hasReadWarning = true),
      };
    }
    return {
      label: translator.translate(isBusy ? 'protectedNotes.setUp.working' : 'protectedNotes.setUp.create'),
      onActivate: setUp,
      isDisabled: isBusy,
    };
  });
</script>

<Dialog
  title={translator.translate('protectedNotes.setUp.title')}
  closeLabel={translator.translate('dialog.close.label')}
  closeTooltip={translator.translate('dialog.close.tooltip')}
  cancelLabel={isRecoveryKeyCovered ? undefined : translator.translate('protectedNotes.setUp.cancel')}
  {primary}
  isInformational={isRecoveryKeyCovered}
  canClose={recoveryKey === undefined && !isBusy}
  {onClose}
>
  {#if isRecoveryKeyCovered}
    <p>{translator.translate('protectedNotes.setUp.recoveryKeyCovered')}</p>
  {:else if recoveryKey !== undefined}
    <div class="fields">
      <p>{translator.translate('protectedNotes.setUp.recoveryKeyIntro')}</p>
      <p class="recovery-key" aria-label={translator.translate('protectedNotes.setUp.recoveryKey')}>
        <code>{recoveryKey}</code>
      </p>
      <p class="hint">{translator.translate('protectedNotes.setUp.doNotCopy')}</p>
      <label for="protected-recovery-end">{translator.translate('protectedNotes.setUp.confirmEnd')}</label>
      <input
        bind:this={firstField}
        bind:value={typedEnd}
        id="protected-recovery-end"
        autocomplete="off"
        spellcheck="false"
        aria-invalid={isEndWrong}
        aria-describedby="protected-recovery-end-error"
      />
      <p id="protected-recovery-end-error" class="error" role="alert">
        {isEndWrong ? translator.translate('protectedNotes.setUp.wrongEnd') : ''}
      </p>
    </div>
  {:else if hasReadWarning}
    <div class="fields">
      <label for="protected-password">{translator.translate('protectedNotes.setUp.password')}</label>
      <input
        bind:this={firstField}
        bind:value={password}
        id="protected-password"
        type="password"
        autocomplete="new-password"
        aria-invalid={passwordProblem === 'tooShort'}
        aria-describedby="protected-password-hint protected-password-error"
        disabled={isBusy}
      />
      <p id="protected-password-hint" class="hint">
        {translator.translate('protectedNotes.setUp.passwordHint')}
      </p>
      <label for="protected-password-again"
        >{translator.translate('protectedNotes.setUp.repeatPassword')}</label
      >
      <input
        bind:value={repeatedPassword}
        id="protected-password-again"
        type="password"
        autocomplete="new-password"
        aria-invalid={passwordProblem === 'mismatch'}
        aria-describedby="protected-password-error"
        disabled={isBusy}
      />
      <p id="protected-password-error" class="error" role="alert">
        {passwordMessageKey ? translator.translate(passwordMessageKey) : ''}
      </p>
    </div>
  {:else}
    <p>{translator.translate('protectedNotes.setUp.warning')}</p>
    <p>{translator.translate('protectedNotes.setUp.warningRecoveryKey')}</p>
  {/if}
</Dialog>

<style>
  .fields {
    display: grid;
    gap: var(--space-2);
  }

  p {
    margin: 0 0 var(--space-2);
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

  .recovery-key code {
    display: block;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    font-family: var(--font-mono);
    letter-spacing: 0.05em;
    overflow-wrap: anywhere;
    user-select: none;
  }

  .hint,
  .error {
    margin: 0;
    font-size: var(--text-size-small);
  }

  .hint {
    color: var(--color-text-secondary);
  }

  input:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
