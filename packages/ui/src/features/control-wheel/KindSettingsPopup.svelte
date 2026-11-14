<script lang="ts">
  import type { WorkspaceKind, WorkspaceKindsState } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import KindIcon from './KindIcon.svelte';
  import { KIND_ICONS, kindNameOf } from './kindPresentation';

  interface Props {
    kinds: WorkspaceKindsState;
    /** Above the wheel's gear, or beside the kind bar's gear. */
    anchor?: 'wheel' | 'bar';
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { kinds, anchor = 'wheel', translator, onCommand, onClose }: Props = $props();

  let popup: HTMLElement | undefined = $state();

  $effect(() => popup?.querySelector<HTMLElement>('[role="switch"]')?.focus());

  function isPlanned(kind: WorkspaceKind): boolean {
    return kind.availability === 'planned';
  }

  function isLastEnabled(kind: WorkspaceKind): boolean {
    return kinds.isEnabled(kind.id) && kinds.enabledKindIds().length === 1;
  }

  function toggle(kind: WorkspaceKind) {
    if (isPlanned(kind) || isLastEnabled(kind)) return;
    onCommand({ kind: 'setWorkspaceKindEnabled', kindId: kind.id, isEnabled: !kinds.isEnabled(kind.id) });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }
</script>

<div
  bind:this={popup}
  class="kind-settings"
  class:beside-bar={anchor === 'bar'}
  role="dialog"
  aria-labelledby="kind-settings-title"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <h2 id="kind-settings-title">{translator.translate('workspaceKinds.settings.label')}</h2>
  <ul>
    {#each kinds.kinds() as kind (kind.id)}
      {@const reasonId = `kind-setting-${kind.id}-reason`}
      {@const isUnavailable = isPlanned(kind) || isLastEnabled(kind)}
      <li>
        <button
          role="switch"
          aria-checked={kinds.isEnabled(kind.id)}
          aria-disabled={isUnavailable}
          aria-describedby={isLastEnabled(kind) ? reasonId : undefined}
          onclick={() => toggle(kind)}
        >
          <KindIcon paths={KIND_ICONS[kind.id]} />
          <span class="name">{kindNameOf(kind.id, translator)}</span>
          {#if isPlanned(kind)}
            <span class="later">{translator.translate('workspaceKinds.availability.later')}</span>
          {:else}
            <span class="track" aria-hidden="true"></span>
          {/if}
        </button>
        {#if isLastEnabled(kind)}
          <p id={reasonId} class="reason">{translator.translate('workspaceKinds.notice.lastEnabled')}</p>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="hint">{translator.translate('workspaceKinds.settings.hint')}</p>
</div>

<style>
  .kind-settings {
    position: absolute;
    inset-block-end: calc(100% + var(--space-2));
    inset-inline-end: 0;
    width: 18rem;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-large);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-medium);
    color: var(--color-text);
  }

  .kind-settings.beside-bar {
    z-index: 15;
    inset-block: 0 auto;
    inset-inline: calc(100% + var(--space-2)) auto;
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-size-body);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    width: 100%;
    min-height: 2.75rem;
    padding-inline: var(--space-2);
    border: 0;
    border-radius: var(--radius-medium);
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  button[aria-disabled='true'] {
    color: var(--color-text-secondary);
  }

  .name {
    flex: 1;
  }

  .track {
    position: relative;
    width: 2.25rem;
    height: 1.25rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
  }

  .track::after {
    content: '';
    position: absolute;
    inset-block-start: 3px;
    inset-inline-start: 3px;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: var(--color-text-secondary);
    transition: inset-inline-start var(--motion-fast) ease-out;
  }

  button[aria-checked='true'] .track {
    border-color: var(--color-accent);
    background: var(--color-accent);
  }

  button[aria-checked='true'] .track::after {
    inset-inline-start: calc(100% - 0.75rem - 3px);
    background: var(--color-accent-text);
  }

  .later,
  .reason,
  .hint {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .reason {
    margin: 0 0 var(--space-1);
    padding-inline-start: calc(1.25rem + 2 * var(--space-2));
  }

  .hint {
    margin: var(--space-2) 0 0;
  }

  @media (forced-colors: active) {
    .track {
      border-color: ButtonText;
    }

    .track::after {
      background: ButtonText;
    }

    button[aria-checked='true'] .track {
      border-color: Highlight;
      background: Highlight;
    }

    button[aria-checked='true'] .track::after {
      background: HighlightText;
    }

    button[aria-disabled='true'] {
      color: GrayText;
    }
  }
</style>
