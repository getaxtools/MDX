<script lang="ts">
  import { MAX_EDITOR_SHARE_PERCENT, MIN_EDITOR_SHARE_PERCENT } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { Snippet } from 'svelte';
  import PanelResizer from '../../components/PanelResizer.svelte';
  import { ScrollSync } from './ScrollSync';

  interface Props {
    isPreviewBeside: boolean;
    editorSharePercent: number;
    /** Lines in the edited text, so the end of the editor matches the end of the preview. */
    lineCount: number;
    /** Changes whenever the preview shows new content, such as its rendered HTML. */
    previewContent: string | undefined;
    translator: Translator;
    onShareChange: (sharePercent: number) => void;
    onShareReset: () => void;
    editor: Snippet<[ScrollSync]>;
    preview: Snippet;
  }

  const {
    isPreviewBeside,
    editorSharePercent,
    lineCount,
    previewContent,
    translator,
    onShareChange,
    onShareReset,
    editor,
    preview,
  }: Props = $props();

  const PERCENT = 100;
  const KEYBOARD_STEP_PERCENT = 2;
  const sync = new ScrollSync();
  let layout: HTMLElement | undefined = $state();
  let draggedSharePercent: number | undefined = $state();
  let previewSide: HTMLElement | undefined = $state();

  const shownSharePercent = $derived(draggedSharePercent ?? editorSharePercent);

  $effect(() => sync.setLineCount(lineCount));

  $effect(() => {
    const scroller = previewSide?.querySelector('main') ?? undefined;
    if (!scroller) return;
    const followPreview = () => sync.previewScrolled();
    scroller.addEventListener('scroll', followPreview);
    sync.attachPreview(scroller);
    return () => {
      scroller.removeEventListener('scroll', followPreview);
      sync.attachPreview(undefined);
    };
  });

  $effect(() => {
    if (previewContent === undefined || !previewSide) return;
    const frame = globalThis.requestAnimationFrame(() => sync.alignPreviewWithEditor());
    return () => globalThis.cancelAnimationFrame(frame);
  });
</script>

<div class="editing-layout" bind:this={layout}>
  <div class="editor-side" style:flex-basis={isPreviewBeside ? `${String(shownSharePercent)}%` : '100%'}>
    {@render editor(sync)}
  </div>
  {#if isPreviewBeside}
    <PanelResizer
      label={translator.translate('editing.previewBeside.resize')}
      size={shownSharePercent}
      growDirection={1}
      minSize={MIN_EDITOR_SHARE_PERCENT}
      maxSize={MAX_EDITOR_SHARE_PERCENT}
      pixelsPerUnit={() => (layout?.clientWidth ?? 0) / PERCENT}
      keyboardStep={KEYBOARD_STEP_PERCENT}
      onPreview={(sharePercent: number) => (draggedSharePercent = sharePercent)}
      onResize={(sharePercent: number) => {
        draggedSharePercent = undefined;
        onShareChange(sharePercent);
      }}
      onReset={onShareReset}
    />
    <section
      class="preview-side"
      aria-label={translator.translate('editing.previewBeside.label')}
      bind:this={previewSide}
    >
      {@render preview()}
    </section>
  {/if}
</div>

<style>
  .editing-layout {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .editor-side {
    display: flex;
    flex-grow: 0;
    flex-shrink: 0;
    min-width: 0;
  }

  .preview-side {
    display: flex;
    flex: 1;
    min-width: 0;
    border-inline-start: 1px solid var(--color-border);
  }

  .preview-side > :global(main) {
    flex: 1;
    min-width: 0;
  }
</style>
