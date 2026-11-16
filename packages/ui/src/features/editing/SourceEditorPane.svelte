<script lang="ts">
  import type { EditingModeSetting, Snippet, Typography } from '@mdx/core';
  import type { EditorSnippet } from '@mdx/editor';
  import { snippetExpander } from '../snippets/snippetExpander';
  import type { BlockAction } from '@mdx/editor';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { isContextMenuKey, type ContextMenuRequest } from '../../components/ContextMenuItem';
  import { editorMenuItems, type EditorMenuChoice } from './blockMenu';
  import type {
    EditorTextRange,
    FormattingState,
    FormulaEditRequest,
    RichTextRendering,
    SourceEditor,
    SlashMenuSettings,
    SourceEditorOptions,
    WikiLinkSuggester,
    WrittenLink,
  } from '@mdx/editor';
  import { listHiddenCharacters } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import type { EditorRequest } from './editingCommands';
  import { editorPhrases } from './editorPhrases';

  interface Props {
    canonicalKey: string;
    fileName: string;
    text: string;
    zoomPercent: number;
    /** The Document style, whose fonts Rich text uses. */
    typography?: Typography;
    /** Rich text or Source; the editor switches without changing the text. */
    editingMode?: EditingModeSetting;
    /** Renders Rich text's widgets as the preview renders this document. */
    richTextRendering?: RichTextRendering | undefined;
    scrollRatio?: number;
    translator: Translator;
    editorRequest?: EditorRequest | undefined;
    /** Whether a slash opens the insert menu, in each mode. */
    slashMenu?: SlashMenuSettings;
    /** Saves a pasted picture and gives the Markdown link to insert. */
    onPastePicture?: (bytes: Uint8Array) => Promise<string | undefined>;
    onCursorCountChange?: (count: number) => void;
    onSelectedTextChange?: (selectedText: string) => void;
    /** Snippets for the insert menu. */
    snippets?: readonly Snippet[];
    /** Suggests notes after `[[` in a note of a Notes workspace. */
    wikiLinks?: WikiLinkSuggester | undefined;
    isShowingHiddenCharacters?: boolean;
    /** Ranges to underline, such as prompt injection findings. */
    markedRanges?: readonly EditorTextRange[];
    /** Typing is refused, as while the notes folder is being moved. */
    isReadOnly?: boolean;
    onChange: (text: string) => void;
    /** Opens a link, as written, the way the preview opens links. */
    onOpenLink?: (link: WrittenLink) => void;
    onCaretInLinkChange?: (isCaretInLink: boolean) => void;
    /** The formatting at the selection, for the Formatting toolbar. */
    onFormattingChange?: (formatting: FormattingState) => void;
    /** Opens the equation editor; without it, formula keys insert an empty formula. */
    onEditFormula?: (request: FormulaEditRequest) => void;
    /** The Image button and Ctrl+Shift+I: choose picture files to copy and link. */
    onChoosePictures?: () => void;
    onScroll?: (scrollRatio: number) => void;
    /** Called once the editor has loaded, for example to keep a preview beside it in step. */
    onReady?: (editor: SourceEditor | undefined) => void;
  }

  const {
    canonicalKey,
    fileName,
    text,
    zoomPercent,
    typography = 'github',
    editingMode = 'source',
    richTextRendering,
    translator,
    editorRequest,
    slashMenu = { isInRichText: false, isInSource: false },
    onPastePicture,
    onCursorCountChange = () => undefined,
    onSelectedTextChange = () => undefined,
    snippets = [],
    wikiLinks,
    isShowingHiddenCharacters = false,
    markedRanges = [],
    isReadOnly = false,
    onChange,
    onOpenLink = () => undefined,
    onCaretInLinkChange = () => undefined,
    onFormattingChange = () => undefined,
    onEditFormula,
    onChoosePictures,
    scrollRatio = 0,
    onScroll = () => undefined,
    onReady = () => undefined,
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let blockMenuRequest: ContextMenuRequest | undefined = $state();
  let isCaretInLink = $state(false);

  /** Shift+F10 or the Menu key in the editor open the block menu at the caret. */
  function openBlockMenu(event: KeyboardEvent) {
    if (!isContextMenuKey(event) || event.isComposing) return;
    const block = editor?.blockAtCaret();
    if (!block) return;
    event.preventDefault();
    event.stopPropagation();
    blockMenuRequest = { x: block.x, y: block.y };
  }

  function chooseEditorMenuItem(choice: EditorMenuChoice) {
    blockMenuRequest = undefined;
    if (choice === 'openLink') editor?.run('openLink');
    else runBlockAction(choice);
  }

  function runBlockAction(action: BlockAction) {
    editor?.runBlockAction(action);
  }

  function reportCaretInLink(isInLink: boolean) {
    isCaretInLink = isInLink;
    onCaretInLinkChange(isInLink);
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

  /** What the editor starts with; later changes reach it through the effects below. */
  function editorOptions(parent: HTMLElement): SourceEditorOptions {
    return untrack(() => ({
      parent,
      text,
      label: translator.translate('editing.editorLabel', { fileName }),
      phrases: editorPhrases(translator),
      onChange: (editedText: string) => onChange(editedText),
      onScroll: (ratio: number) => onScroll(ratio),
      slashMenu,
      editingMode,
      ...(onPastePicture ? { onPastePicture } : {}),
      onCursorCountChange: (count: number) => onCursorCountChange(count),
      onSelectedTextChange: (selectedText: string) => onSelectedTextChange(selectedText),
      onOpenLink: (link: WrittenLink) => onOpenLink(link),
      onCaretInLinkChange: reportCaretInLink,
      onFormattingChange: (formatting: FormattingState) => onFormattingChange(formatting),
      ...(onEditFormula ? { onEditFormula: (request: FormulaEditRequest) => onEditFormula(request) } : {}),
      ...(onChoosePictures ? { onChoosePictures: () => onChoosePictures() } : {}),
      typography,
      ...(richTextRendering ? { richTextRendering } : {}),
      snippets: editorSnippets,
      ...(wikiLinks ? { wikiLinks } : {}),
      findHiddenCharacters: (lineText: string) => listHiddenCharacters(lineText),
      isShowingHiddenCharacters,
      isReadOnly,
    }));
  }

  $effect(() => {
    const parent = container;
    if (!parent) return;
    let isClosed = false;
    let created: SourceEditor | undefined;
    void import('@mdx/editor').then(({ createSourceEditor }) => {
      if (isClosed) return;
      created = createSourceEditor(editorOptions(parent));
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
      if (untrack(() => isCaretInLink)) reportCaretInLink(false);
      onReady(undefined);
      created?.destroy();
      editor = undefined;
    };
  });

  $effect(() => {
    editor?.setSlashMenuSettings(slashMenu);
  });

  $effect(() => {
    editor?.setSnippets(editorSnippets);
  });

  $effect(() => {
    editor?.setTypography(typography);
  });

  $effect(() => {
    editor?.setEditingMode(editingMode);
  });

  $effect(() => {
    editor?.setHiddenCharactersShown(isShowingHiddenCharacters);
  });

  $effect(() => {
    editor?.markRanges(markedRanges);
  });

  $effect(() => {
    editor?.setReadOnly(isReadOnly);
  });

  $effect(() => {
    const request = editorRequest;
    if (!editor || !request || request.id <= handledRequestId || request.canonicalKey !== canonicalKey)
      return;
    handledRequestId = request.id;
    runEditorRequest(editor, request);
  });

  function runEditorRequest(shownEditor: SourceEditor, request: EditorRequest) {
    if (request.kind === 'command') shownEditor.run(request.command);
    else if (request.kind === 'changeSection') shownEditor.changeSection(request.line, request.action);
    else if (request.kind === 'revealLine') shownEditor.revealLine(request.line);
    else if (request.kind === 'insertPictureLinks')
      shownEditor.insertPictureLinks(request.links, request.point);
    else if (request.kind === 'revealRange') shownEditor.revealRange(request.range);
    else if (request.kind === 'insertSnippet')
      shownEditor.insertSnippet(snippetExpander(request.body, { fileName, locale: translator.locale }));
    else shownEditor.replaceText(request.text);
  }
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
    items={editorMenuItems(translator, { isCaretInLink })}
    position={blockMenuRequest}
    onChoose={chooseEditorMenuItem}
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
