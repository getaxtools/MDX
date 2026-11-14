<script lang="ts">
  import type { KindSwitcher, WorkspaceKindsState } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import KindIcon from './KindIcon.svelte';
  import KindSettingsPopup from './KindSettingsPopup.svelte';
  import { GEAR_ICON, KIND_ICONS, kindNameOf } from './kindPresentation';

  interface Props {
    kinds: WorkspaceKindsState;
    kindSwitcher: KindSwitcher;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { kinds, kindSwitcher, translator, onCommand }: Props = $props();

  /** With one built kind there is nothing to switch to, so the bar stays out of the way. */
  const MIN_BUILT_KINDS = 2;

  let group: HTMLElement | undefined = $state();
  let gearButton: HTMLButtonElement | undefined = $state();
  let isKindSettingsOpen = $state(false);

  const builtKindCount = $derived(kinds.kinds().filter((kind) => kind.availability === 'built').length);
  const isShown = $derived(kindSwitcher !== 'wheel' && builtKindCount >= MIN_BUILT_KINDS);
  const gearLabel = $derived(translator.translate('controlWheel.gear.label'));

  $effect(() => {
    if (!isKindSettingsOpen) return undefined;
    function closeOnPressOutside(event: PointerEvent) {
      if (event.target instanceof Node && !group?.contains(event.target)) isKindSettingsOpen = false;
    }
    globalThis.addEventListener('pointerdown', closeOnPressOutside, true);
    return () => globalThis.removeEventListener('pointerdown', closeOnPressOutside, true);
  });

  function closeKindSettings() {
    isKindSettingsOpen = false;
    gearButton?.focus();
  }
</script>

{#if isShown}
  <div
    bind:this={group}
    class="kind-bar"
    role="group"
    aria-label={translator.translate('controlWheel.kinds.label')}
  >
    {#each kinds.enabledKindIds() as kindId (kindId)}
      {@const name = kindNameOf(kindId, translator)}
      <button
        aria-label={name}
        title={name}
        aria-pressed={kindId === kinds.activeKindId()}
        onclick={() => onCommand({ kind: 'switchWorkspaceKind', kindId })}
      >
        <KindIcon paths={KIND_ICONS[kindId]} />
      </button>
    {/each}
    <button
      bind:this={gearButton}
      aria-label={gearLabel}
      title={gearLabel}
      aria-haspopup="dialog"
      aria-expanded={isKindSettingsOpen}
      onclick={() => (isKindSettingsOpen = !isKindSettingsOpen)}
    >
      <KindIcon paths={GEAR_ICON} />
    </button>
    {#if isKindSettingsOpen}
      <KindSettingsPopup {kinds} anchor="bar" {translator} {onCommand} onClose={closeKindSettings} />
    {/if}
  </div>
  <hr class="separator" />
{/if}

<style>
  .kind-bar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: center;
  }

  button {
    position: relative;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-medium);
    background: none;
    color: var(--color-text-secondary);
  }

  button:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  button[aria-pressed='true'] {
    color: var(--color-accent);
    background: var(--color-surface-selected);
  }

  /* The pressed kind also gets a mark at its start edge, so it is not shown by colour alone. */
  button[aria-pressed='true']::before {
    content: '';
    position: absolute;
    inset-block: 6px;
    inset-inline-start: -6px;
    width: 3px;
    border-radius: 2px;
    background: var(--color-accent);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .separator {
    width: 24px;
    margin: var(--space-1) 0;
    border: 0;
    border-top: 1px solid var(--color-border);
  }

  @media (forced-colors: active) {
    button[aria-pressed='true'] {
      outline: 1px solid Highlight;
    }

    button[aria-pressed='true']::before {
      background: Highlight;
    }
  }
</style>
