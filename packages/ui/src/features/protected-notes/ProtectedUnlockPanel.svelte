<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { ProtectedNotesView } from './ProtectedNotesActions';
  import { passwordProblemOf, type PasswordProblem } from './protectedPasswords';

  interface Props {
    view: ProtectedNotesView;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { view, translator, onCommand }: Props = $props();

  type UnlockWay = 'thisPc' | 'password' | 'recoveryKey';

  const PASSWORD_PROBLEMS: Record<PasswordProblem, MessageKey> = {
    tooShort: 'protectedNotes.setUp.tooShort',
    mismatch: 'protectedNotes.setUp.mismatch',
  };

  let chosenWay: UnlockWay | undefined = $state();
  let password = $state('');
  let shouldRemember = $state(false);
  let isRememberExplained = $state(false);
  let recoveryKey = $state('');
  let newPassword = $state('');
  let repeatedNewPassword = $state('');
  let newPasswordProblem: PasswordProblem | undefined = $state();

  const isRememberedHere = $derived(
    view.canUnlockOnThisPc && view.unlockProblem !== 'protectedNotes.unlock.notRemembered',
  );
  const way: UnlockWay = $derived(chosenWay ?? (isRememberedHere ? 'thisPc' : 'password'));
  const problemKey = $derived(
    newPasswordProblem ? PASSWORD_PROBLEMS[newPasswordProblem] : view.unlockProblem,
  );

  function choose(nextWay: UnlockWay) {
    chosenWay = nextWay;
    newPasswordProblem = undefined;
  }

  function unlockWithPassword(event: SubmitEvent) {
    event.preventDefault();
    if (password === '') return;
    onCommand({ kind: 'unlockProtectedSection', password, shouldRemember });
    password = '';
  }

  function unlockWithRecoveryKey(event: SubmitEvent) {
    event.preventDefault();
    newPasswordProblem = passwordProblemOf(newPassword, repeatedNewPassword);
    if (newPasswordProblem || recoveryKey.trim() === '') return;
    onCommand({ kind: 'unlockProtectedWithRecoveryKey', recoveryKey, newPassword });
    newPassword = '';
    repeatedNewPassword = '';
  }
</script>

<div class="unlock-panel">
  {#if way === 'thisPc'}
    <p class="explanation">{translator.translate('protectedNotes.unlock.rememberedHere')}</p>
    <button
      class="primary"
      disabled={view.isBusy}
      onclick={() => onCommand({ kind: 'unlockProtectedOnThisPc' })}
    >
      {translator.translate(view.isBusy ? 'protectedNotes.unlock.unlocking' : 'protectedNotes.unlock.unlock')}
    </button>
    <button class="link" onclick={() => choose('password')}>
      {translator.translate('protectedNotes.unlock.usePassword')}
    </button>
  {:else if way === 'password'}
    <form onsubmit={unlockWithPassword} autocomplete="off">
      <label for="protected-unlock-password">{translator.translate('protectedNotes.unlock.password')}</label>
      <input
        bind:value={password}
        id="protected-unlock-password"
        type="password"
        autocomplete="off"
        aria-invalid={view.unlockProblem === 'protectedNotes.unlock.wrongPassword'}
        aria-describedby="protected-unlock-problem"
        disabled={view.isBusy}
      />
      <label class="remember">
        <input
          type="checkbox"
          bind:checked={shouldRemember}
          aria-describedby={isRememberExplained ? 'protected-remember-explained' : undefined}
          disabled={view.isBusy}
        />
        {translator.translate('protectedNotes.unlock.remember')}
      </label>
      <button
        type="button"
        class="link"
        aria-expanded={isRememberExplained}
        aria-controls="protected-remember-explained"
        onclick={() => (isRememberExplained = !isRememberExplained)}
      >
        {translator.translate('protectedNotes.unlock.whatDoesThisMean')}
      </button>
      <p id="protected-remember-explained" class="explanation" hidden={!isRememberExplained}>
        {translator.translate('protectedNotes.unlock.rememberExplained')}
      </p>
      <button type="submit" class="primary" disabled={view.isBusy}>
        {translator.translate(
          view.isBusy ? 'protectedNotes.unlock.unlocking' : 'protectedNotes.unlock.unlock',
        )}
      </button>
    </form>
    <button class="link" onclick={() => choose('recoveryKey')}>
      {translator.translate('protectedNotes.unlock.useRecoveryKey')}
    </button>
  {:else}
    <form onsubmit={unlockWithRecoveryKey} autocomplete="off">
      <p class="explanation">{translator.translate('protectedNotes.unlock.recoveryExplained')}</p>
      <label for="protected-unlock-recovery-key"
        >{translator.translate('protectedNotes.unlock.recoveryKey')}</label
      >
      <input
        bind:value={recoveryKey}
        id="protected-unlock-recovery-key"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="protected-unlock-problem"
        disabled={view.isBusy}
      />
      <label for="protected-unlock-new-password"
        >{translator.translate('protectedNotes.unlock.newPassword')}</label
      >
      <input
        bind:value={newPassword}
        id="protected-unlock-new-password"
        type="password"
        autocomplete="off"
        aria-invalid={newPasswordProblem === 'tooShort'}
        aria-describedby="protected-unlock-problem"
        disabled={view.isBusy}
      />
      <label for="protected-unlock-new-password-again">
        {translator.translate('protectedNotes.unlock.repeatNewPassword')}
      </label>
      <input
        bind:value={repeatedNewPassword}
        id="protected-unlock-new-password-again"
        type="password"
        autocomplete="off"
        aria-invalid={newPasswordProblem === 'mismatch'}
        aria-describedby="protected-unlock-problem"
        disabled={view.isBusy}
      />
      <button type="submit" class="primary" disabled={view.isBusy}>
        {translator.translate(
          view.isBusy ? 'protectedNotes.unlock.unlocking' : 'protectedNotes.unlock.unlock',
        )}
      </button>
    </form>
    <button class="link" onclick={() => choose('password')}>
      {translator.translate('protectedNotes.unlock.usePassword')}
    </button>
  {/if}
  <p id="protected-unlock-problem" class="problem" role="alert">
    {problemKey ? translator.translate(problemKey) : ''}
  </p>
</div>

<style>
  .unlock-panel,
  form {
    display: grid;
    gap: var(--space-2);
  }

  .explanation,
  .problem {
    margin: 0;
    font-size: var(--text-size-small);
  }

  .explanation {
    color: var(--color-text-secondary);
  }

  .problem:empty {
    display: none;
  }

  input:not([type='checkbox']) {
    min-width: 0;
    height: 28px;
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

  .remember {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .remember input {
    width: 16px;
    height: 16px;
    margin: 0;
  }

  button {
    justify-self: start;
    min-height: 28px;
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

  button.link {
    min-height: 24px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    text-decoration: underline;
  }

  :is(input, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
