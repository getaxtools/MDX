<script lang="ts">
  import type { SourceEditor } from '@mdx/editor';
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import type { EditorRequest } from './editingCommands';
  import { editorPhrases } from './editorPhrases';

  interface Props {
    canonicalKey: string;
    fileName: string;
    text: string;
    zoomPercent: number;
    scrollRatio?: number;
    translator: Translator;
    editorRequest?: EditorRequest | undefined;
    onChange: (text: string) => void;
    onScroll?: (scrollRatio: number) => void;
  }

  const {
    canonicalKey,
    fileName,
    text,
    zoomPercent,
    translator,
    editorRequest,
    onChange,
    scrollRatio = 0,
    onScroll = () => undefined,
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let editor: SourceEditor | undefined = $state();
  let handledRequestId = untrack(() => editorRequest?.id ?? 0);

  $effect(() => {
    const parent = container;
    if (!parent) return;
    let isClosed = false;
    let created: SourceEditor | undefined;
    void import('@mdx/editor').then(({ createSourceEditor }) => {
      if (isClosed) return;
      created = createSourceEditor({
        parent,
        text: untrack(() => text),
        label: translator.translate('editing.editorLabel', { fileName }),
        phrases: editorPhrases(translator),
        onChange: (editedText) => onChange(editedText),
        onScroll: (ratio) => onScroll(ratio),
      });
      editor = created;
      const startingEditor = created;
      globalThis.requestAnimationFrame(() => startingEditor.scrollToRatio(untrack(() => scrollRatio)));
      created.focus();
    });
    return () => {
      isClosed = true;
      created?.destroy();
      editor = undefined;
    };
  });

  $effect(() => {
    const request = editorRequest;
    if (!editor || !request || request.id <= handledRequestId || request.canonicalKey !== canonicalKey)
      return;
    handledRequestId = request.id;
    if (request.kind === 'command') editor.run(request.command);
    else editor.replaceText(request.text);
  });
</script>

<div class="source-editor" style:font-size="{zoomPercent}%" bind:this={container}>
  {#if !editor}
    <p class="loading">{translator.translate('editing.loading')}</p>
  {/if}
</div>

<style>
  .source-editor {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .source-editor :global(.cm-editor) {
    height: 100%;
  }

  .loading {
    margin: var(--space-6);
    color: var(--color-text-secondary);
  }
</style>
