<script lang="ts">
  import type { WorkspaceColour, WorkspaceIcon, WorkspaceKindId } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import { KIND_ICONS, kindColourOf, kindNameOf } from '../control-wheel/kindPresentation';
  import { WORKSPACE_COLOUR_VALUES, WORKSPACE_ICON_PATHS } from './workspacePresentation';

  interface Props {
    name: string;
    kindId: WorkspaceKindId;
    icon?: WorkspaceIcon | undefined;
    colour?: WorkspaceColour | undefined;
    translator: Translator;
  }

  const { name, kindId, icon, colour, translator }: Props = $props();

  const KEPT_LISTS_KEYS: Readonly<Record<WorkspaceKindId, MessageKey>> = {
    markdownViewer: 'workspaces.preview.keeps.markdownViewer',
    notes: 'workspaces.preview.keeps.notes',
    specViewer: 'workspaces.preview.keeps.specViewer',
  };

  const shownName = $derived(name.trim() || translator.translate('workspaces.preview.untitled'));
  const iconPaths = $derived(icon ? WORKSPACE_ICON_PATHS[icon] : KIND_ICONS[kindId]);
  const summary = $derived(
    translator.translate('workspaces.preview.summary', {
      kind: kindNameOf(kindId, translator),
      keeps: translator.translate(KEPT_LISTS_KEYS[kindId]),
    }),
  );
</script>

<div class="preview" role="group" aria-label={translator.translate('workspaces.preview.label')}>
  <span
    class="tile"
    class:coloured={colour !== undefined}
    style:background={colour ? WORKSPACE_COLOUR_VALUES[colour] : undefined}
    style:color={colour ? undefined : kindColourOf(kindId)}
  >
    <KindIcon paths={iconPaths} />
  </span>
  <span class="text">
    <span class="name">{shownName}</span>
    <span class="summary">{summary}</span>
  </span>
</div>

<style>
  .preview {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    margin-block-end: var(--space-2);
  }

  .tile {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-large);
    background: var(--color-surface-raised);
  }

  /* The fixed workspace colours keep 3:1 against white, in every theme. */
  .tile.coloured {
    border-color: transparent;
    color: #fff;
  }

  .text {
    display: grid;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  @media (forced-colors: active) {
    .tile.coloured {
      border-color: CanvasText;
      color: CanvasText;
    }
  }
</style>
