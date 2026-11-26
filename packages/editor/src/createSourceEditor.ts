import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertBlankLine,
  redo,
  selectAll,
  undo,
} from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { gotoLine, openSearchPanel, search, searchKeymap, selectNextOccurrence } from '@codemirror/search';
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Extension,
} from '@codemirror/state';
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
import { pictureChooserFacet } from './attachments/pictureRequests';
import { insertPlainText, plainTextPaste } from './attachments/plainTextPaste';
import { blockMenuOpener } from './blocks/blockHandle';
import { tableAsTextAtCaret } from './tables/grid/tablesAsText';
import { formulaPasteState, pasteFormulas } from './formula-paste/formulaPaste';
import { calloutTypeChange, type CalloutFoldSign } from './rich-text/calloutMarker';
import { calloutTypeMenuOpener } from './rich-text/calloutTitleWidget';
import {
  formulaInsertion,
  type FormulaKind,
  type FormulaRefusal,
  type FormulaTarget,
} from './formulas/formulaInsertion';
import {
  editFormulaInOrder,
  formulaEditorFacet,
  startDisplayFormulaAfterDollars,
  startFormula,
  type FormulaEditRequest,
} from './formulas/formulaRequests';
import { blockAction, blockAtCaret, calloutFoldAtCaret, type BlockAction } from './blocks/blockActions';
import type { BlockKind } from './blocks/markdownBlocks';
import { sectionChange, type SectionAction } from './blocks/outlineSections';
import {
  DEFAULT_EDITING_MODE,
  editingModeExtension,
  editingModeOf,
  setEditingMode,
  type EditingMode,
} from './editing-mode/editingMode';
import { EDITOR_ACTION_COMMANDS } from './editorActionCommands';
import { formattingStateOf, type FormattingState } from './formatting/formattingState';
import { runToolboxAction } from './formatting/toolboxCommands';
import { isSlashMenuOnIn, SLASH_MENU_OFF, type SlashMenuSettings } from './editing-mode/slashMenuSettings';
import { editorCompletions } from './slash-menu/slashMenu';
import { spellCheckExtension } from './spelling/proseOnlySpelling';
import { isSpellCheckOnIn, SPELL_CHECK_OFF, type SpellCheckSettings } from './spelling/spellCheckSettings';
import { WIKI_LINK_BRACKETS } from './wiki-links/wikiLinkBrackets';
import { wikiLinkCompletions, type WikiLinkSuggester } from './wiki-links/wikiLinkCompletions';
import { snippetFields, snippetInsertion, type SnippetExpander } from './snippets/snippetFields';
import { snippetMenuProvider, type EditorSnippet } from './snippets/snippetMenu';
import { selectNextCell, selectPreviousCell } from './tables/tableNavigation';
import { EDITOR_SHORTCUTS, type ToolboxAction } from './editorShortcuts';
import {
  hiddenCharacterMarkers,
  markedRangesField,
  setMarkedRanges,
  type HiddenCharacterFinder,
} from './hidden-characters/hiddenCharacters';
import { editorTheme, markdownHighlightStyle } from './editorTheme';
import { markdownSyntax } from './syntax/markdownSyntax';
import { isComposing } from './rich-text/compositionHold';
import { linkOpener, openLinkAtCaret } from './rich-text/linkOpening';
import { isInLink, type WrittenLink } from './rich-text/linkTargets';
import { richTextProvidersFacet, type RichTextProviders } from './rich-text/richTextProviders';
import { embedResolverFacet, openEmbedAtCaret, type EmbedResolver } from './rich-text/embeds';
import { richTextRenderingFacet, type RichTextRendering } from './rich-text/richTextRendering';
import {
  DEFAULT_EDITOR_TYPOGRAPHY,
  setTypography,
  typographyExtension,
  type EditorTypography,
} from './rich-text/typography';

export type EditorMenuCommand =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'find'
  | 'replace'
  | 'goToLine'
  | 'copyLineUp'
  | 'copyLineDown'
  | 'addNextOccurrence'
  | 'openLink'
  | 'insertEquation'
  | 'editTableAsText';

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
  /** Whether a slash opens the insert menu, in Rich text and in Source; off in both when not given. */
  readonly slashMenu?: SlashMenuSettings;
  /** Whether the operating system marks misspelled prose, in Rich text and in Source; off when not given. */
  readonly spellCheck?: SpellCheckSettings;
  /** Saves a pasted picture next to the document and gives the Markdown link to insert. */
  readonly onPastePicture?: (bytes: Uint8Array) => Promise<string | undefined>;
  /** How many cursors or selections there are, reported when the number changes. */
  readonly onCursorCountChange?: (count: number) => void;
  /** The selected text, reported when the selection changes; empty when nothing is selected. */
  readonly onSelectedTextChange?: (selectedText: string) => void;
  /** Snippets offered in the insert menu. */
  readonly snippets?: readonly EditorSnippet[];
  /**
   * Suggests notes after `[[` and their headings after `#`, in a note of a Notes workspace, where
   * Rich text also shows wiki-links without their brackets.
   */
  readonly wikiLinks?: WikiLinkSuggester;
  /** Rich text or Source; Source when not given. */
  readonly editingMode?: EditingMode;
  /** Called after the editor switched to another mode. */
  readonly onEditingModeChange?: (mode: EditingMode) => void;
  /** Opens a link, given as written in the document, the way the preview opens links. */
  readonly onOpenLink?: (link: WrittenLink) => void;
  /** Whether the caret is in a link in Rich text, reported when that changes, so Open Link can be offered. */
  readonly onCaretInLinkChange?: (isCaretInLink: boolean) => void;
  /** The Document style, whose fonts Rich text uses. */
  readonly typography?: EditorTypography;
  /** The formatting at the selection, for the Formatting toolbar; reported at most once a frame. */
  readonly onFormattingChange?: (formatting: FormattingState) => void;
  /** Renders Rich text's widgets the way the preview renders this document; without it, blocks stay text. */
  readonly richTextRendering?: RichTextRendering;
  /** Shows the embeds the workspace kind resolves, read-only, in Rich text. */
  readonly embedResolver?: EmbedResolver;
  /** Widgets and decorations of the workspace kind and of later editor features. */
  readonly richTextProviders?: RichTextProviders;
  /** Finds the hidden characters of a line, for Show hidden characters; without it none are drawn. */
  readonly findHiddenCharacters?: HiddenCharacterFinder;
  readonly isShowingHiddenCharacters?: boolean;
  /** Opens the equation editor; formulas are written back with `insertFormula`. */
  readonly onEditFormula?: (request: FormulaEditRequest) => void;
  /** Lets the user choose picture files for the Image button and Ctrl+Shift+I. */
  readonly onChoosePictures?: () => void;
  /** Typing and other changes are refused, as while the notes folder is being moved. */
  readonly isReadOnly?: boolean;
  /** Opens the block menu at a point, for the block at the caret, from a click on Rich text's block handle. */
  readonly onOpenBlockMenu?: (point: { readonly x: number; readonly y: number }) => void;
  /** Opens the callout type menu from a callout's icon; the choice is written back with `setCalloutType`. */
  readonly onOpenCalloutTypeMenu?: (
    point: { readonly x: number; readonly y: number },
    type: { readonly from: number; readonly to: number },
  ) => void;
}

/** A place in the text by zero-based line and column, in UTF-16 code units from the start of the line. */
export interface EditorTextPosition {
  readonly line: number;
  readonly column: number;
}

export interface EditorTextRange {
  readonly from: EditorTextPosition;
  readonly to: EditorTextPosition;
}

/** What became of a formula the equation editor wrote back. */
export type FormulaWriteOutcome = 'written' | FormulaRefusal;

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
  /** Selects a range, such as a prompt injection finding, scrolls it into view and focuses the editor. */
  revealRange(range: EditorTextRange): void;
  /** Draws hidden characters as labelled chips, or stops drawing them; the text never changes. */
  setHiddenCharactersShown(isShown: boolean): void;
  /** Underlines ranges, such as findings; they follow the text while it is edited. */
  markRanges(ranges: readonly EditorTextRange[]): void;
  /** Replaces the whole text, for example after the file was reloaded from disk. */
  replaceText(text: string): void;
  run(command: EditorMenuCommand): void;
  /** Moves, promotes or demotes the outline section whose heading is on a zero-based line, as one undo step. */
  changeSection(headingLine: number, action: SectionAction): void;
  setSlashMenuSettings(settings: SlashMenuSettings): void;
  setSpellCheckSettings(settings: SpellCheckSettings): void;
  setSnippets(snippets: readonly EditorSnippet[]): void;
  /** Inserts a snippet at the selection, selecting its first field. */
  insertSnippet(expand: SnippetExpander): void;
  /** The block at the caret and where the caret is on screen, for the block menu. */
  blockAtCaret():
    | {
        readonly kind: BlockKind;
        readonly x: number;
        readonly y: number;
        /** For a callout: how it is written to start, which Start collapsed and Start expanded change. */
        readonly calloutFold?: CalloutFoldSign;
      }
    | undefined;
  /** The callout type menu's choice: replaces only the type word of the callout at the range. */
  setCalloutType(range: { readonly from: number; readonly to: number }, type: string): void;
  runBlockAction(action: BlockAction): void;
  /** Adds picture links on their own lines at the line start nearest to a point, or at the caret. */
  insertPictureLinks(links: readonly string[], point?: { readonly x: number; readonly y: number }): void;
  editingMode(): EditingMode;
  /** Switches between Rich text and Source without changing the text, the selection or the undo history. */
  setEditingMode(mode: EditingMode): void;
  setTypography(typography: EditorTypography): void;
  /** Paste as Plain Text from the menu: inserts text exactly at the selection, as one undo step. */
  insertPlainText(text: string): void;
  /** Runs a Formatting toolbar control on the selection, leaving the focus where it is. */
  runFormatting(action: ToolboxAction): void;
  /**
   * Writes the equation editor's formula at its target as one undo step and focuses the editor, or
   * says why it was not written; a refusal about the source leaves the focus where it is.
   */
  insertFormula(
    target: FormulaTarget,
    formula: { readonly tex: string; readonly kind: FormulaKind },
  ): FormulaWriteOutcome;
  /** Edit Formula from the preview: opens the equation editor on the formula the preview counted as `index`. */
  editFormulaInOrder(index: number, source: string): boolean;
  /** Refuses or allows changes; the text can still be read, selected and copied. */
  setReadOnly(isReadOnly: boolean): void;
  destroy(): void;
}

/**
 * Keys the app owns while editing: Ctrl+E returns to preview, Ctrl+/ switches Rich text and Source,
 * Ctrl+D stars the document, Alt+arrows go back and forward.
 */
const KEYS_LEFT_TO_THE_APP = new Set([
  'Mod-e',
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
  const modeSwitches: ModeSwitches = { slashMenu: new Compartment(), spellCheck: new Compartment() };
  const hiddenCharactersSwitch = new Compartment();
  const formatting = formattingReporter(options);
  const readOnlySwitch = new Compartment();
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        startingExtensions(options, modeSwitches, hiddenCharactersSwitch),
        readOnlySwitch.of(readOnlyExtension(options.isReadOnly === true)),
        formatting.extension,
      ],
    }),
  });
  const commands = menuCommandsOf(view);
  const { stopReportingScroll, ...scrolling } = scrollingOf(view, options);
  return {
    focus: () => view.focus(),
    text: () => view.state.doc.toString(),
    ...scrolling,
    revealLine: (line) => revealLine(view, line),
    revealRange: (range) => revealRange(view, range),
    ...hiddenCharacterControlOf(view, hiddenCharactersSwitch, options),
    ...readOnlyControlOf(view, readOnlySwitch),
    run: (command) => commands[command](),
    ...blockEditingOf(view),
    ...modeSettingsOf(view, modeSwitches, options),
    ...toolboxEditingOf(view),
    destroy: () => {
      formatting.stop();
      stopReportingScroll();
      view.destroy();
    },
  };
}

/** Settings that apply per editing mode, reconfigured when the mode changes. */
interface ModeSwitches {
  readonly slashMenu: Compartment;
  readonly spellCheck: Compartment;
}

function modeSettingsOf(
  view: EditorView,
  switches: ModeSwitches,
  options: SourceEditorOptions,
): Pick<
  SourceEditor,
  | 'setSlashMenuSettings'
  | 'setSnippets'
  | 'insertSnippet'
  | 'setSpellCheckSettings'
  | 'editingMode'
  | 'setEditingMode'
  | 'setTypography'
> {
  const { followEditingMode: followSlashMenu, ...slashMenu } = slashMenuControlOf(
    view,
    switches.slashMenu,
    options,
  );
  const { followEditingMode: followSpellCheck, ...spellCheck } = spellCheckControlOf(
    view,
    switches.spellCheck,
    options,
  );
  const followEditingMode = () => {
    followSlashMenu();
    followSpellCheck();
  };
  return { ...slashMenu, ...spellCheck, ...editingModeControlOf(view, followEditingMode) };
}

function editingModeControlOf(
  view: EditorView,
  followEditingMode: () => void,
): Pick<SourceEditor, 'editingMode' | 'setEditingMode' | 'setTypography'> {
  return {
    editingMode: () => editingModeOf(view.state),
    setEditingMode: (mode) => {
      setEditingMode(view, mode);
      followEditingMode();
    },
    setTypography: (typography) => setTypography(view, typography),
  };
}

function startingExtensions(
  options: SourceEditorOptions,
  modeSwitches: ModeSwitches,
  hiddenCharactersSwitch: Compartment,
): Extension[] {
  const mode = options.editingMode ?? DEFAULT_EDITING_MODE;
  return [
    modeSwitches.slashMenu.of(initialSlashMenu(options, mode)),
    modeSwitches.spellCheck.of(initialSpellCheck(options)),
    hiddenCharactersSwitch.of(initialHiddenCharacters(options)),
    editingModeExtension(mode, options.onEditingModeChange),
    typographyExtension(options.typography ?? DEFAULT_EDITOR_TYPOGRAPHY),
    editorExtensions(options),
    plainTextPaste(),
    appDialogExtensions(options),
    options.wikiLinks ? richTextProvidersFacet.of({ inline: [WIKI_LINK_BRACKETS] }) : [],
  ];
}

/** The app's equation editor, which `$$` then Enter also opens, its picture chooser and the block menu. */
function appDialogExtensions(options: SourceEditorOptions): Extension {
  const { onEditFormula, onChoosePictures, onOpenBlockMenu, onOpenCalloutTypeMenu } = options;
  return [
    onOpenBlockMenu ? blockMenuOpener.of(onOpenBlockMenu) : [],
    onOpenCalloutTypeMenu ? calloutTypeMenuOpener.of(onOpenCalloutTypeMenu) : [],
    onEditFormula ? formulaEditorFacet.of(onEditFormula) : [],
    onEditFormula ? Prec.highest(keymap.of([{ key: 'Enter', run: startDisplayFormulaAfterDollars }])) : [],
    onChoosePictures ? pictureChooserFacet.of(onChoosePictures) : [],
  ];
}

function toolboxEditingOf(
  view: EditorView,
): Pick<SourceEditor, 'runFormatting' | 'insertFormula' | 'editFormulaInOrder' | 'insertPlainText'> {
  return {
    runFormatting: (action) => runToolboxAction(view, action),
    insertPlainText: (text) => {
      insertPlainText(view, text);
      view.focus();
    },
    insertFormula: (target, formula) => insertFormula(view, target, formula),
    editFormulaInOrder: (index, source) => editFormulaInOrder(view, index, source),
  };
}

function insertFormula(
  view: EditorView,
  target: FormulaTarget,
  formula: { readonly tex: string; readonly kind: FormulaKind },
): FormulaWriteOutcome {
  const insertion = formulaInsertion(view.state, target, formula);
  if (insertion.outcome === 'written') view.dispatch(insertion.spec);
  const outcome = insertion.outcome === 'written' ? 'written' : insertion.refusal;
  if (outcome === 'written' || outcome === 'textChanged') view.focus();
  return outcome;
}

/** Reports the formatting at the selection once per frame while the selection or the text changes. */
function formattingReporter(options: SourceEditorOptions): {
  readonly extension: Extension;
  readonly stop: () => void;
} {
  const report = options.onFormattingChange;
  if (!report) return { extension: [], stop: () => undefined };
  let frame: number | undefined;
  let lastReported = '';
  const reportFor = (view: EditorView) => {
    frame = undefined;
    const formatting = formattingStateOf(view.state);
    const key = JSON.stringify(formatting);
    if (key === lastReported) return;
    lastReported = key;
    report(formatting);
  };
  const extension = EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged && !update.viewportChanged) return;
    frame ??= globalThis.requestAnimationFrame(() => reportFor(update.view));
  });
  return {
    extension,
    stop: () => {
      if (frame !== undefined) globalThis.cancelAnimationFrame(frame);
    },
  };
}

/** Marks the app replacing the whole text, as after a reload from disk, which read-only allows. */
const appReplacement = Annotation.define<boolean>();

/**
 * CodeMirror's read-only facet stops typing, but commands such as list continuation or bold must
 * check it themselves; the change filter refuses every change they make as well.
 */
function readOnlyExtension(isReadOnly: boolean): Extension {
  if (!isReadOnly) return EditorState.readOnly.of(false);
  return [
    EditorState.readOnly.of(true),
    EditorState.changeFilter.of((transaction) => transaction.annotation(appReplacement) === true),
  ];
}

function readOnlyControlOf(
  view: EditorView,
  readOnlySwitch: Compartment,
): Pick<SourceEditor, 'replaceText' | 'setReadOnly'> {
  return {
    replaceText: (text) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: appReplacement.of(true),
      }),
    setReadOnly: (isReadOnly) =>
      view.dispatch({ effects: readOnlySwitch.reconfigure(readOnlyExtension(isReadOnly)) }),
  };
}

function scrollingOf(
  view: EditorView,
  options: SourceEditorOptions,
): Pick<SourceEditor, 'scrollToRatio' | 'topLine' | 'scrollToLine'> & {
  readonly stopReportingScroll: () => void;
} {
  const scroller = view.scrollDOM;
  const scrollableHeight = () => Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
  const reportScroll = () => {
    const height = scrollableHeight();
    options.onScroll?.(height > 0 ? scroller.scrollTop / height : 0);
  };
  scroller.addEventListener('scroll', reportScroll);
  return {
    scrollToRatio: (scrollRatio) => {
      scroller.scrollTop = scrollRatio * scrollableHeight();
    },
    topLine: () => topLineOf(view),
    scrollToLine: (line) => {
      scroller.scrollTop = scrollTopForLine(view, line);
    },
    stopReportingScroll: () => scroller.removeEventListener('scroll', reportScroll),
  };
}

function hiddenCharacterControlOf(
  view: EditorView,
  hiddenCharactersSwitch: Compartment,
  options: SourceEditorOptions,
): Pick<SourceEditor, 'setHiddenCharactersShown' | 'markRanges'> {
  return {
    setHiddenCharactersShown: (isShown) =>
      view.dispatch({ effects: hiddenCharactersSwitch.reconfigure(hiddenCharactersFor(options, isShown)) }),
    markRanges: (ranges) =>
      view.dispatch({
        effects: setMarkedRanges.of(
          ranges.map((range) => ({ from: offsetOf(view, range.from), to: offsetOf(view, range.to) })),
        ),
      }),
  };
}

function initialHiddenCharacters(options: SourceEditorOptions): Extension {
  return hiddenCharactersFor(options, options.isShowingHiddenCharacters === true);
}

function hiddenCharactersFor(options: SourceEditorOptions, isShown: boolean): Extension {
  return isShown && options.findHiddenCharacters ? hiddenCharacterMarkers(options.findHiddenCharacters) : [];
}

function initialSlashMenu(options: SourceEditorOptions, mode: EditingMode): Extension {
  const isOn = isSlashMenuOnIn(options.slashMenu ?? SLASH_MENU_OFF, mode);
  return completionsFor(isOn, options.snippets ?? [], options.wikiLinks);
}

function completionsFor(
  isSlashMenuEnabled: boolean,
  snippets: readonly EditorSnippet[],
  wikiLinks: WikiLinkSuggester | undefined,
): Extension {
  return editorCompletions({
    ...(isSlashMenuEnabled ? { slashProviders: [snippetMenuProvider(snippets)] } : {}),
    sources: wikiLinks ? [wikiLinkCompletions(wikiLinks)] : [],
  });
}

/**
 * The insert menu follows its setting for the mode the editor is in, and its snippet group changes
 * with the user's snippets.
 */
function slashMenuControlOf(
  view: EditorView,
  slashMenuSwitch: Compartment,
  options: SourceEditorOptions,
): Pick<SourceEditor, 'setSlashMenuSettings' | 'setSnippets' | 'insertSnippet'> & {
  readonly followEditingMode: () => void;
} {
  let settings = options.slashMenu ?? SLASH_MENU_OFF;
  let snippets = options.snippets ?? [];
  const reconfigureSlashMenu = () => {
    const isOn = isSlashMenuOnIn(settings, editingModeOf(view.state));
    view.dispatch({
      effects: slashMenuSwitch.reconfigure(completionsFor(isOn, snippets, options.wikiLinks)),
    });
  };
  return {
    followEditingMode: reconfigureSlashMenu,
    setSnippets: (changed) => {
      snippets = changed;
      reconfigureSlashMenu();
    },
    setSlashMenuSettings: (changed) => {
      settings = changed;
      reconfigureSlashMenu();
    },
    insertSnippet: (expand) => {
      const { from, to } = view.state.selection.main;
      view.dispatch(snippetInsertion(view.state, { from, to }, expand));
      view.focus();
    },
  };
}

function initialSpellCheck(options: SourceEditorOptions): Extension {
  const mode = options.editingMode ?? DEFAULT_EDITING_MODE;
  return spellCheckExtension(isSpellCheckOnIn(options.spellCheck ?? SPELL_CHECK_OFF, mode));
}

/** Spell check follows its setting for the mode the editor is in. */
function spellCheckControlOf(
  view: EditorView,
  spellCheckSwitch: Compartment,
  options: SourceEditorOptions,
): Pick<SourceEditor, 'setSpellCheckSettings'> & { readonly followEditingMode: () => void } {
  let settings = options.spellCheck ?? SPELL_CHECK_OFF;
  let isOn = isSpellCheckOnIn(settings, editingModeOf(view.state));
  // Only a change of on or off reconfigures, so settings handed again while typing never redraw the marks.
  const reconfigure = () => {
    const isOnNow = isSpellCheckOnIn(settings, editingModeOf(view.state));
    if (isOnNow === isOn) return;
    isOn = isOnNow;
    view.dispatch({ effects: spellCheckSwitch.reconfigure(spellCheckExtension(isOn)) });
  };
  return {
    followEditingMode: reconfigure,
    setSpellCheckSettings: (changed) => {
      settings = changed;
      reconfigure();
    },
  };
}

function blockEditingOf(
  view: EditorView,
): Pick<
  SourceEditor,
  'changeSection' | 'insertPictureLinks' | 'blockAtCaret' | 'runBlockAction' | 'setCalloutType'
> {
  return {
    blockAtCaret: () => {
      const block = blockAtCaret(view.state);
      const caret = view.coordsAtPos(view.state.selection.main.head);
      if (!block || !caret) return undefined;
      const calloutFold = calloutFoldAtCaret(view.state);
      return {
        kind: block.kind,
        x: caret.left,
        y: caret.bottom,
        ...(calloutFold === undefined ? {} : { calloutFold }),
      };
    },
    setCalloutType: (range, type) => {
      const spec = calloutTypeChange(view.state, range, type);
      if (spec) view.dispatch(spec);
      view.focus();
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
    openLink: () => openLinkAtCaret(view) || openEmbedAtCaret(view),
    insertEquation: () => startFormula(undefined)(view),
    editTableAsText: () => {
      const spec = tableAsTextAtCaret(view.state);
      if (spec) view.dispatch(spec);
      return spec !== undefined;
    },
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

/** Columns past the end of a line stop at its end, so a range given for text with CRLF still fits. */
function offsetOf(view: EditorView, { line, column }: EditorTextPosition): number {
  const { doc } = view.state;
  const documentLine = doc.line(Math.min(Math.max(Math.floor(line), 0), doc.lines - 1) + 1);
  return Math.min(documentLine.from + Math.max(column, 0), documentLine.to);
}

function revealRange(view: EditorView, range: EditorTextRange): void {
  const anchor = offsetOf(view, range.from);
  const head = Math.max(anchor, offsetOf(view, range.to));
  view.dispatch({
    selection: { anchor, head },
    effects: EditorView.scrollIntoView(EditorSelection.range(anchor, head), { y: 'center' }),
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
    markedRangesField,
    ...multipleCursors(),
    snippetFields(),
    EditorView.lineWrapping,
    markdownSyntax(),
    closeBrackets(),
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: BRACKETS_CLOSED_AUTOMATICALLY } }]),
    search({ top: true }),
    syntaxHighlighting(markdownHighlightStyle),
    editorTheme,
    EditorState.phrases.of(options.phrases),
    options.onOpenLink ? linkOpener.of(options.onOpenLink) : [],
    options.richTextRendering ? richTextRenderingFacet.of(options.richTextRendering) : [],
    options.embedResolver ? embedResolverFacet.of(options.embedResolver) : [],
    options.richTextProviders ? richTextProvidersFacet.of(options.richTextProviders) : [],
    // An explicit tab stop lets checkers see that the scrolling editor can be reached with the keyboard.
    EditorView.contentAttributes.of({ 'aria-label': options.label, tabindex: '0' }),
    ...editorKeymaps(),
    formulaPasteState(),
    EditorView.domEventHandlers({ paste: (event, view) => pasteInOrder(event, view, options) }),
    EditorView.updateListener.of((update) => reportChanges(update, options)),
  ];
}

function editorKeymaps(): Extension[] {
  return [
    keymap.of(formattingKeymap()),
    EditorView.domEventHandlers({ keydown: runPhysicalKeyShortcut }),
    keymap.of([
      { key: 'Tab', run: selectNextCell },
      { key: 'Shift-Tab', run: selectPreviousCell },
    ]),
    keymap.of(
      withoutKeysLeftToTheApp([
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...historyKeymap,
        { key: 'Mod-Enter', run: insertBlankLineUnlessComposing },
        ...defaultKeymap.filter((binding) => binding.key !== 'Mod-Enter'),
        indentWithTab,
        { key: 'Mod-h', run: openSearchPanel },
        { key: 'Mod-g', run: gotoLine },
      ]),
    ),
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
  reportCaretInLink(update, options);
}

function isCaretInLink(state: EditorState): boolean {
  return editingModeOf(state) === 'richText' && isInLink(state, state.selection.main.head);
}

function canMoveCaretIntoLink(update: ViewUpdate): boolean {
  return (
    update.selectionSet ||
    update.docChanged ||
    update.transactions.some((transaction) => transaction.reconfigured)
  );
}

function reportCaretInLink(update: ViewUpdate, options: SourceEditorOptions): void {
  if (!options.onCaretInLinkChange || !canMoveCaretIntoLink(update)) return;
  const isInLinkNow = isCaretInLink(update.state);
  if (isInLinkNow !== isCaretInLink(update.startState)) options.onCaretInLinkChange(isInLinkNow);
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

/**
 * A paste runs the first handler that applies: Ctrl+Shift+V's plain text (handled before this),
 * picture files, formulas, remote pictures, then the default paste.
 */
function pasteInOrder(event: ClipboardEvent, view: EditorView, options: SourceEditorOptions): boolean {
  return (
    pastePictureFiles(event, view, options) || pasteFormulas(event, view) || pasteRemotePictures(event, view)
  );
}

/** Pasted picture files are saved next to the document. */
function pastePictureFiles(event: ClipboardEvent, view: EditorView, options: SourceEditorOptions): boolean {
  const pictures = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
  const { onPastePicture } = options;
  if (pictures.length === 0 || !onPastePicture) return false;
  event.preventDefault();
  for (const picture of pictures) void insertPastedPicture(view, picture, onPastePicture);
  return true;
}

/** Pasted HTML that holds only remote pictures becomes links to them. */
function pasteRemotePictures(event: ClipboardEvent, view: EditorView): boolean {
  const clipboard = event.clipboardData;
  if (!clipboard) return false;
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
  return EDITOR_SHORTCUTS.filter((shortcut) => shortcut.code === undefined).map(({ action, key }) => ({
    key,
    run: EDITOR_ACTION_COMMANDS[action],
    preventDefault: true,
  }));
}

/** Shortcuts matched on the physical key run with Ctrl alone, whatever the key types on the layout. */
function runPhysicalKeyShortcut(event: KeyboardEvent, view: EditorView): boolean {
  if (event.isComposing || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
  const shortcut = EDITOR_SHORTCUTS.find((candidate) => candidate.code === event.code);
  if (!shortcut) return false;
  EDITOR_ACTION_COMMANDS[shortcut.action](view);
  return true;
}

/** An input method may use Ctrl+Enter while it composes, so the key does nothing then. */
function insertBlankLineUnlessComposing(view: EditorView): boolean {
  return !isComposing(view) && insertBlankLine(view);
}

function withoutKeysLeftToTheApp(bindings: readonly KeyBinding[]): KeyBinding[] {
  return bindings.filter(
    (binding) =>
      binding.key === undefined ||
      (!KEYS_LEFT_TO_THE_APP.has(binding.key) && !KEYS_USED_FOR_MOVING_BLOCKS.has(binding.key)),
  );
}
