<script lang="ts">
  import type { Snippet } from '@mdx/core';
  import type { EditorSnippet } from '@mdx/editor';
  import { snippetExpander } from '../snippets/snippetExpander';
  import type { BlockAction } from '@mdx/editor';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { isContextMenuKey, type ContextMenuRequest } from '../../components/ContextMenuItem';
  import { blockMenuItems } from './blockMenu';
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
    /** Whether a slash at the start of a line or after a space opens the insert menu. */
    isSlashMenuEnabled?: boolean;
    /** Saves a pasted picture and gives the Markdown link to insert. */
    onPastePicture?: (bytes: Uint8Array) => Promise<string | undefined>;
    onCursorCountChange?: (count: number) => void;
    onSelectedTextChange?: (selectedText: string) => void;
    /** Snippets for the insert menu. */
    snippets?: readonly Snippet[];
    onChange: (text: string) => void;
    onScroll?: (scrollRatio: number) => void;
    /** Called once the editor has loaded, for example to keep a preview beside it in step. */
    onReady?: (editor: SourceEditor | undefined) => void;
  }

  const {
    canonicalKey,
    fileName,
    text,
    zoomPercent,
    translator,
    editorRequest,
    isSlashMenuEnabled = false,
    onPastePicture,
    onCursorCountChange = () => undefined,
    onSelectedTextChange = () => undefined,
    snippets = [],
    onChange,
    scrollRatio = 0,
    onScroll = () => undefined,
    onReady = () => undefined,
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let blockMenuRequest: ContextMenuRequest | undefined = $state();

  /** Shift+F10 or the Menu key in the editor open the block menu at the caret. */
  function openBlockMenu(event: KeyboardEvent) {
    if (!isContextMenuKey(event) || event.isComposing) return;
    const block = editor?.blockAtCaret();
    if (!block) return;
    event.preventDefault();
    event.stopPropagation();
    blockMenuRequest = { x: block.x, y: block.y };
  }

  function runBlockAction(action: BlockAction) {
    blockMenuRequest = undefined;
    editor?.runBlockAction(action);
  }

  function closeBlockMenu() {
    blockMenuRequest = undefined;
    editor?.focus();
  }
  const editorSnippets: EditorSnippet[] = $derived(
    snippets.map((snippet) => ({
      id: snippet.id,
      name: snippet.name,
      trigger: snippet.trigger,
      expand: snippetExpander(snippet.body, { fileName, locale: translator.locale }),
    })),
  );
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
        isSlashMenuEnabled: untrack(() => isSlashMenuEnabled),
        ...(onPastePicture ? { onPastePicture } : {}),
        onCursorCountChange: (count) => onCursorCountChange(count),
        onSelectedTextChange: (selectedText) => onSelectedTextChange(selectedText),
        snippets: untrack(() => editorSnippets),
      });
      editor = created;
      const startingEditor = created;
      globalThis.requestAnimationFrame(() => {
        startingEditor.scrollToRatio(untrack(() => scrollRatio));
        onReady(startingEditor);
      });
      created.focus();
    });
    return () => {
      isClosed = true;
      onReady(undefined);
      created?.destroy();
      editor = undefined;
    };
  });

  $effect(() => {
    editor?.setSlashMenuEnabled(isSlashMenuEnabled);
  });

  $effect(() => {
    editor?.setSnippets(editorSnippets);
  });

  $effect(() => {
    const request = editorRequest;
    if (!editor || !request || request.id <= handledRequestId || request.canonicalKey !== canonicalKey)
      return;
    handledRequestId = request.id;
    if (request.kind === 'command') editor.run(request.command);
    else if (request.kind === 'changeSection') editor.changeSection(request.line, request.action);
    else if (request.kind === 'insertPictureLinks') editor.insertPictureLinks(request.links, request.point);
    else if (request.kind === 'insertSnippet')
      editor.insertSnippet(snippetExpander(request.body, { fileName, locale: translator.locale }));
    else editor.replaceText(request.text);
  });
</script>

<!-- The editor inside is the focusable element; this only listens for the block menu keys it lets through. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="source-editor" style:font-size="{zoomPercent}%" bind:this={container} onkeydown={openBlockMenu}>
  {#if !editor}
    <p class="loading">{translator.translate('editing.loading')}</p>
  {/if}
</div>

{#if blockMenuRequest}
  <ContextMenu
    label={translator.translate('editor.blockMenu.label')}
    items={blockMenuItems(translator)}
    position={blockMenuRequest}
    onChoose={runBlockAction}
    onClose={closeBlockMenu}
  />
{/if}

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
