<script lang="ts">
  import type { WorkspaceKindId } from '@mdx/core';
  import type { Snippet } from 'svelte';
  import type { Translator } from '@mdx/i18n';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import { KIND_ICONS, kindNameOf } from '../control-wheel/kindPresentation';
  import { tooltipWithShortcut } from '../shortcuts/commandShortcuts';
  import { colourValueOf, workspaceIconPathsOf } from './workspacePresentation';

  interface Props {
    name: string;
    kindId: WorkspaceKindId;
    icon: string | null;
    colour: string | null;
    shortcutLabel: string | undefined;
    translator: Translator;
    onSwitch: () => void;
    /** Buttons at the end of the header, such as Hide side bar. */
    actions?: Snippet | undefined;
  }

  const { name, kindId, icon, colour, shortcutLabel, translator, onSwitch, actions }: Props = $props();

  const iconPaths = $derived(workspaceIconPathsOf(icon, KIND_ICONS[kindId]));
  const colourValue = $derived(colourValueOf(colour));

  const accessibleName = $derived(
    translator.translate('workspaces.headerButton', { name, kind: kindNameOf(kindId, translator) }),
  );
</script>

<div class="workspace-header">
  <button
    class="workspace-button"
    aria-label={accessibleName}
    title={tooltipWithShortcut(accessibleName, shortcutLabel)}
    onclick={onSwitch}
  >
    <KindIcon paths={iconPaths} />
    {#if colourValue}<span class="swatch" style:background={colourValue}></span>{/if}
    <span class="name">{name}</span>
  </button>
  {@render actions?.()}
</div>

<style>
  .workspace-header {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    padding: var(--space-1) var(--space-2);
    border-block-end: 1px solid var(--color-border);
    border-inline-end: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .workspace-button {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    min-height: 28px;
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-medium);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-weight: 600;
    text-align: start;
  }

  .workspace-button:hover {
    background: var(--color-surface-hover);
  }

  .workspace-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  .workspace-button :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
  }

  .swatch {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
