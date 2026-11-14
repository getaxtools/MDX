import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  selectAll,
  undo,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { gotoLine, openSearchPanel, search, searchKeymap, selectNextOccurrence } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  keymap,
  rectangularSelection,
  type KeyBinding,
  type ViewUpdate,
} from '@codemirror/view';
import { nearestLineStart, pictureLinksAt, remotePictureMarkdown } from './attachments/pictureInsertion';
import { blockAction, blockAtCaret, type BlockAction } from './blocks/blockActions';
import type { BlockKind } from './blocks/markdownBlocks';
import { sectionChange, type SectionAction } from './blocks/outlineSections';
import { EDITOR_ACTION_COMMANDS } from './editorActionCommands';
import { slashMenu } from './slash-menu/slashMenu';
import { snippetFields, snippetInsertion, type SnippetExpander } from './snippets/snippetFields';
import { snippetMenuProvider, type EditorSnippet } from './snippets/snippetMenu';
import { selectNextCell, selectPreviousCell } from './tables/tableNavigation';
import { EDITOR_SHORTCUTS } from './editorShortcuts';
import { editorTheme, markdownHighlightStyle } from './editorTheme';

export type EditorMenuCommand =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'find'
  | 'replace'
  | 'goToLine'
  | 'copyLineUp'
  | 'copyLineDown'
  | 'addNextOccurrence';

export interface SourceEditorOptions {
  readonly parent: HTMLElement;
  readonly text: string;
  /** The editor's accessible name, such as "Source of Guide.md". */
  readonly label: string;
  /** Translations of CodeMirror's own words, such as the search panel's "Find" and "Replace". */
  readonly phrases: Readonly<Record<string, string>>;
  readonly onChange: (text: string) => void;
  /** How far down the text is scrolled, from 0 to 1, so the preview can open at the same place. */
  readonly onScroll?: (scrollRatio: number) => void;
  /** Whether a slash at the start of a line or after a space opens the insert menu. */
  readonly isSlashMenuEnabled?: boolean;
  /** Saves a pasted picture next to the document and gives the Markdown link to insert. */
  readonly onPastePicture?: (bytes: Uint8Array) => Promise<string | undefined>;
  /** How many cursors or selections there are, reported when the number changes. */
  readonly onCursorCountChange?: (count: number) => void;
  /** The selected text, reported when the selection changes; empty when nothing is selected. */
  readonly onSelectedTextChange?: (selectedText: string) => void;
  /** Snippets offered in the insert menu. */
  readonly snippets?: readonly EditorSnippet[];
}

export interface SourceEditor {
  focus(): void;
  text(): string;
  /** Scrolls to a place given from 0 (top) to 1 (end), such as where the preview was. */
  scrollToRatio(scrollRatio: number): void;
  /** The zero-based line at the top of the view, with a fraction for how far into it the view starts. */
  topLine(): number;
  /** Scrolls so that a zero-based line, with an optional fraction, is at the top of the view. */
  scrollToLine(line: number): void;
  /** Moves the caret to the start of a zero-based line, shows that line at the top and focuses the editor. */
  revealLine(line: number): void;
  /** Replaces the whole text, for example after the file was reloaded from disk. */
  replaceText(text: string): void;
  run(command: EditorMenuCommand): void;
  /** Moves, promotes or demotes the outline section whose heading is on a zero-based line, as one undo step. */
  changeSection(headingLine: number, action: SectionAction): void;
  setSlashMenuEnabled(isEnabled: boolean): void;
  setSnippets(snippets: readonly EditorSnippet[]): void;
  /** Inserts a snippet at the selection, selecting its first field. */
  insertSnippet(expand: SnippetExpander): void;
  /** The block at the caret and where the caret is on screen, for the block menu. */
  blockAtCaret(): { readonly kind: BlockKind; readonly x: number; readonly y: number } | undefined;
  runBlockAction(action: BlockAction): void;
  /** Adds picture links on their own lines at the line start nearest to a point, or at the caret. */
  insertPictureLinks(links: readonly string[], point?: { readonly x: number; readonly y: number }): void;
  destroy(): void;
}

/** Keys the app owns while editing: Ctrl+/ returns to preview, Ctrl+D stars the document, Alt+arrows go back and forward. */
const KEYS_LEFT_TO_THE_APP = new Set([
  'Mod-/',
  'Mod-d',
  'Alt-A',
  'Shift-Alt-a',
  'Alt-ArrowLeft',
  'Alt-ArrowRight',
]);
/** CodeMirror copies lines with these keys; here they move blocks, and copying lines is in the palette. */
const KEYS_USED_FOR_MOVING_BLOCKS = new Set(['Shift-Alt-ArrowUp', 'Shift-Alt-ArrowDown']);
const BRACKETS_CLOSED_AUTOMATICALLY = ['(', '[', '{', '"', '`'];

export function createSourceEditor(options: SourceEditorOptions): SourceEditor {
  const slashMenuSwitch = new Compartment();
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [slashMenuSwitch.of(initialSlashMenu(options)), editorExtensions(options)],
    }),
  });
  const commands = menuCommandsOf(view);
  const scroller = view.scrollDOM;
  const scrollableHeight = () => Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
  const reportScroll = () => {
    const height = scrollableHeight();
    options.onScroll?.(height > 0 ? scroller.scrollTop / height : 0);
  };
  scroller.addEventListener('scroll', reportScroll);
  return {
    focus: () => view.focus(),
    text: () => view.state.doc.toString(),
    scrollToRatio: (scrollRatio) => {
      scroller.scrollTop = scrollRatio * scrollableHeight();
    },
    topLine: () => topLineOf(view),
    scrollToLine: (line) => {
      scroller.scrollTop = scrollTopForLine(view, line);
    },
    revealLine: (line) => revealLine(view, line),
    replaceText: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    run: (command) => commands[command](),
    ...blockEditingOf(view),
    ...slashMenuControlOf(view, slashMenuSwitch, options),
    destroy: () => {
      scroller.removeEventListener('scroll', reportScroll);
      view.destroy();
    },
  };
}

function initialSlashMenu(options: SourceEditorOptions): Extension {
  return options.isSlashMenuEnabled === true ? slashMenu([snippetMenuProvider(options.snippets ?? [])]) : [];
}

/** The insert menu can be turned on and off, and its snippet group changes with the user's snippets. */
function slashMenuControlOf(
  view: EditorView,
  slashMenuSwitch: Compartment,
  options: SourceEditorOptions,
): Pick<SourceEditor, 'setSlashMenuEnabled' | 'setSnippets' | 'insertSnippet'> {
  let isSlashMenuEnabled = options.isSlashMenuEnabled === true;
  let snippets = options.snippets ?? [];
  const reconfigureSlashMenu = () =>
    view.dispatch({
      effects: slashMenuSwitch.reconfigure(
        isSlashMenuEnabled ? slashMenu([snippetMenuProvider(snippets)]) : [],
      ),
    });
  return {
    setSnippets: (changed) => {
      snippets = changed;
      reconfigureSlashMenu();
    },
    setSlashMenuEnabled: (isEnabled) => {
      isSlashMenuEnabled = isEnabled;
      reconfigureSlashMenu();
    },
    insertSnippet: (expand) => {
      const { from, to } = view.state.selection.main;
      view.dispatch(snippetInsertion(view.state, { from, to }, expand));
      view.focus();
    },
  };
}

function blockEditingOf(
  view: EditorView,
): Pick<SourceEditor, 'changeSection' | 'insertPictureLinks' | 'blockAtCaret' | 'runBlockAction'> {
  return {
    blockAtCaret: () => {
      const block = blockAtCaret(view.state);
      const caret = view.coordsAtPos(view.state.selection.main.head);
      return block && caret ? { kind: block.kind, x: caret.left, y: caret.bottom } : undefined;
    },
    runBlockAction: (action) => {
      const spec = blockAction(view.state, action);
      if (spec) view.dispatch(spec);
      view.focus();
    },
    insertPictureLinks: (links, point) => {
      const position = (point && view.posAtCoords(point)) ?? view.state.selection.main.head;
      view.dispatch(pictureLinksAt(view.state, nearestLineStart(view.state, position), links));
    },
    changeSection: (headingLine, action) => {
      const change = sectionChange(view.state, headingLine, action);
      if (change.outcome === 'changed') view.dispatch(change.spec);
    },
  };
}

function menuCommandsOf(view: EditorView): Readonly<Record<EditorMenuCommand, () => void>> {
  return {
    undo: () => undo(view),
    redo: () => redo(view),
    selectAll: () => selectAll(view),
    find: () => openSearchPanel(view),
    replace: () => {
      openSearchPanel(view);
      view.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus();
    },
    goToLine: () => gotoLine(view),
    copyLineUp: () => copyLineUp(view),
    copyLineDown: () => copyLineDown(view),
    addNextOccurrence: () => selectNextOccurrence(view),
  };
}

function revealLine(view: EditorView, line: number): void {
  const { doc } = view.state;
  const lineStart = doc.line(Math.min(Math.max(Math.floor(line), 0), doc.lines - 1) + 1).from;
  view.dispatch({
    selection: { anchor: lineStart },
    effects: EditorView.scrollIntoView(lineStart, { y: 'start' }),
  });
  view.focus();
}

function topLineOf(view: EditorView): number {
  const height = Math.max(view.scrollDOM.scrollTop - view.documentPadding.top, 0);
  const block = view.lineBlockAtHeight(height);
  const lineIndex = view.state.doc.lineAt(block.from).number - 1;
  const fraction = block.height > 0 ? (height - block.top) / block.height : 0;
  return lineIndex + Math.min(Math.max(fraction, 0), 1);
}

function scrollTopForLine(view: EditorView, line: number): number {
  const { doc } = view.state;
  const lineIndex = Math.min(Math.max(Math.floor(line), 0), doc.lines - 1);
  const block = view.lineBlockAt(doc.line(lineIndex + 1).from);
  const fraction = Math.min(Math.max(line - lineIndex, 0), 1);
  return block.top + fraction * block.height + view.documentPadding.top;
}

function editorExtensions(options: SourceEditorOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    ...multipleCursors(),
    snippetFields(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    closeBrackets(),
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: BRACKETS_CLOSED_AUTOMATICALLY } }]),
    search({ top: true }),
    syntaxHighlighting(markdownHighlightStyle),
    editorTheme,
    EditorState.phrases.of(options.phrases),
    // An explicit tab stop lets checkers see that the scrolling editor can be reached with the keyboard.
    EditorView.contentAttributes.of({ 'aria-label': options.label, spellcheck: 'false', tabindex: '0' }),
    keymap.of(formattingKeymap()),
    keymap.of([
      { key: 'Tab', run: selectNextCell },
      { key: 'Shift-Tab', run: selectPreviousCell },
    ]),
    keymap.of(
      withoutKeysLeftToTheApp([
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
        { key: 'Mod-h', run: openSearchPanel },
        { key: 'Mod-g', run: gotoLine },
      ]),
    ),
    EditorView.domEventHandlers({ paste: (event, view) => pastePictures(event, view, options) }),
    EditorView.updateListener.of((update) => reportChanges(update, options)),
  ];
}

function reportChanges(update: ViewUpdate, options: SourceEditorOptions): void {
  if (update.docChanged) options.onChange(update.state.doc.toString());
  const count = update.state.selection.ranges.length;
  if (count !== update.startState.selection.ranges.length) options.onCursorCountChange?.(count);
  if (update.selectionSet || update.docChanged) {
    const selectedText = update.state.selection.ranges
      .map((range) => update.state.sliceDoc(range.from, range.to))
      .join('\n');
    options.onSelectedTextChange?.(selectedText);
  }
}

/**
 * Several cursors, added Windows-style: Ctrl+Alt+Up and Down, Alt+click and Alt+Shift+drag for a
 * column. Ctrl+click stays free for opening links. An input method types at the main cursor only.
 */
function multipleCursors(): Extension[] {
  return [
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey && !event.shiftKey),
    rectangularSelection({ eventFilter: (event) => event.altKey && event.shiftKey }),
    crosshairCursor({ key: 'Alt' }),
    EditorView.domEventHandlers({
      compositionstart: (_event, view) => {
        const { selection } = view.state;
        if (selection.ranges.length > 1) {
          view.dispatch({ selection: EditorSelection.single(selection.main.anchor, selection.main.head) });
        }
        return false;
      },
    }),
  ];
}

/** Pasted picture files are saved next to the document; pasted remote pictures become links. */
function pastePictures(event: ClipboardEvent, view: EditorView, options: SourceEditorOptions): boolean {
  const clipboard = event.clipboardData;
  if (!clipboard) return false;
  const pictures = [...clipboard.files].filter((file) => file.type.startsWith('image/'));
  const { onPastePicture } = options;
  if (pictures.length > 0 && onPastePicture) {
    event.preventDefault();
    for (const picture of pictures) void insertPastedPicture(view, picture, onPastePicture);
    return true;
  }
  const remoteLinks = remotePictureMarkdown(clipboard.getData('text/html'), (html) =>
    new globalThis.DOMParser().parseFromString(html, 'text/html'),
  );
  if (remoteLinks === undefined) return false;
  event.preventDefault();
  view.dispatch(view.state.replaceSelection(remoteLinks), { userEvent: 'input.paste' });
  return true;
}

async function insertPastedPicture(
  view: EditorView,
  picture: File,
  onPastePicture: (bytes: Uint8Array) => Promise<string | undefined>,
): Promise<void> {
  const link = await onPastePicture(new Uint8Array(await picture.arrayBuffer()));
  if (link !== undefined) view.dispatch(view.state.replaceSelection(link), { userEvent: 'input.paste' });
}

function formattingKeymap(): KeyBinding[] {
  return EDITOR_SHORTCUTS.map(({ action, key }) => ({
    key,
    run: EDITOR_ACTION_COMMANDS[action],
    preventDefault: true,
  }));
}

function withoutKeysLeftToTheApp(bindings: readonly KeyBinding[]): KeyBinding[] {
  return bindings.filter(
    (binding) =>
      binding.key === undefined ||
      (!KEYS_LEFT_TO_THE_APP.has(binding.key) && !KEYS_USED_FOR_MOVING_BLOCKS.has(binding.key)),
  );
}
