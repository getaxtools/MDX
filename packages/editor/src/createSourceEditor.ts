import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  selectAll,
  undo,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { gotoLine, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { EDITOR_ACTION_COMMANDS } from './editorActionCommands';
import { EDITOR_SHORTCUTS } from './editorShortcuts';
import { editorTheme, markdownHighlightStyle } from './editorTheme';

export type EditorMenuCommand = 'undo' | 'redo' | 'selectAll' | 'find' | 'replace' | 'goToLine';

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
const BRACKETS_CLOSED_AUTOMATICALLY = ['(', '[', '{', '"', '`'];

export function createSourceEditor(options: SourceEditorOptions): SourceEditor {
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: options.text, extensions: editorExtensions(options) }),
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
    destroy: () => {
      scroller.removeEventListener('scroll', reportScroll);
      view.destroy();
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
    EditorView.lineWrapping,
    markdown(),
    closeBrackets(),
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: BRACKETS_CLOSED_AUTOMATICALLY } }]),
    search({ top: true }),
    syntaxHighlighting(markdownHighlightStyle),
    editorTheme,
    EditorState.phrases.of(options.phrases),
    // An explicit tab stop lets checkers see that the scrolling editor can be reached with the keyboard.
    EditorView.contentAttributes.of({ 'aria-label': options.label, spellcheck: 'false', tabindex: '0' }),
    keymap.of(formattingKeymap()),
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
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
    }),
  ];
}

function formattingKeymap(): KeyBinding[] {
  return EDITOR_SHORTCUTS.map(({ action, key }) => ({
    key,
    run: EDITOR_ACTION_COMMANDS[action],
    preventDefault: true,
  }));
}

function withoutKeysLeftToTheApp(bindings: readonly KeyBinding[]): KeyBinding[] {
  return bindings.filter((binding) => binding.key === undefined || !KEYS_LEFT_TO_THE_APP.has(binding.key));
}
