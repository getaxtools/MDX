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
  /** Replaces the whole text, for example after the file was reloaded from disk. */
  replaceText(text: string): void;
  run(command: EditorMenuCommand): void;
  destroy(): void;
}

/** Keys the app itself owns while editing: Ctrl+/ switches back to preview and Ctrl+D stars the document. */
const KEYS_LEFT_TO_THE_APP = new Set(['Mod-/', 'Mod-d', 'Alt-A', 'Shift-Alt-a']);
const BRACKETS_CLOSED_AUTOMATICALLY = ['(', '[', '{', '"', '`'];

export function createSourceEditor(options: SourceEditorOptions): SourceEditor {
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: options.text, extensions: editorExtensions(options) }),
  });
  const commands: Readonly<Record<EditorMenuCommand, () => void>> = {
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
    replaceText: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    run: (command) => commands[command](),
    destroy: () => {
      scroller.removeEventListener('scroll', reportScroll);
      view.destroy();
    },
  };
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
    EditorView.contentAttributes.of({ 'aria-label': options.label, spellcheck: 'false' }),
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
