<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import { isRecoveryKeyConfirmed, passwordProblemOf, type PasswordProblem } from './protectedPasswords';

  interface Props {
    /** Present once the section is set up, until the user typed its end back. */
    recoveryKey?: string | undefined;
    problem?: MessageKey | undefined;
    isBusy: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { recoveryKey, problem, isBusy, translator, onCommand, onClose }: Props = $props();

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

  const passwordMessageKey = $derived(passwordProblem ? PASSWORD_PROBLEMS[passwordProblem] : problem);

  function setUp(event: SubmitEvent) {
    event.preventDefault();
    passwordProblem = passwordProblemOf(password, repeatedPassword);
    if (passwordProblem) return;
    onCommand({ kind: 'setUpProtectedSection', password });
    password = '';
    repeatedPassword = '';
  }

  function finish(event: SubmitEvent) {
    event.preventDefault();
    isEndWrong = recoveryKey === undefined || !isRecoveryKeyConfirmed(recoveryKey, typedEnd);
    if (!isEndWrong) onCommand({ kind: 'finishProtectedSetUp' });
  }
</script>

<Dialog
  title={translator.translate('protectedNotes.setUp.title')}
  closeLabel={translator.translate('protectedNotes.setUp.cancel')}
  canClose={recoveryKey === undefined && !isBusy}
  {onClose}
>
  {#if recoveryKey !== undefined}
    <form onsubmit={finish} autocomplete="off">
      <p>{translator.translate('protectedNotes.setUp.recoveryKeyIntro')}</p>
      <p class="recovery-key" aria-label={translator.translate('protectedNotes.setUp.recoveryKey')}>
        <code>{recoveryKey}</code>
      </p>
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
      <div class="actions">
        <button type="submit" class="primary">{translator.translate('protectedNotes.setUp.finish')}</button>
      </div>
    </form>
  {:else if hasReadWarning}
    <form onsubmit={setUp} autocomplete="off">
      <label for="protected-password">{translator.translate('protectedNotes.setUp.password')}</label>
      <input
        bind:this={firstField}
        bind:value={password}
        id="protected-password"
        type="password"
        autocomplete="off"
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
        autocomplete="off"
        aria-invalid={passwordProblem === 'mismatch'}
        aria-describedby="protected-password-error"
        disabled={isBusy}
      />
      <p id="protected-password-error" class="error" role="alert">
        {passwordMessageKey ? translator.translate(passwordMessageKey) : ''}
      </p>
      <div class="actions">
        <button type="submit" class="primary" disabled={isBusy}>
          {translator.translate(isBusy ? 'protectedNotes.setUp.working' : 'protectedNotes.setUp.create')}
        </button>
      </div>
    </form>
  {:else}
    <p>{translator.translate('protectedNotes.setUp.warning')}</p>
    <p>{translator.translate('protectedNotes.setUp.warningRecoveryKey')}</p>
    <div class="actions">
      <button class="primary" onclick={() => (hasReadWarning = true)}>
        {translator.translate('protectedNotes.setUp.continue')}
      </button>
    </div>
  {/if}
</Dialog>

<style>
  form {
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
    user-select: all;
  }

  .hint,
  .error {
    margin: 0;
    font-size: var(--text-size-small);
  }

  .hint {
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
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

  button.primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  :is(input, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
