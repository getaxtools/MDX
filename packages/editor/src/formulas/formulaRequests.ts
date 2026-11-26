import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, Facet } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';
import { isComposing } from '../rich-text/compositionHold';
import { FORMULA_CLASS } from '../rich-text/richTextClasses';
import { insertMenuItemAtSelection } from '../slash-menu/slashMenuItems';
import {
  formulaAt,
  formulaAtSelection,
  type FormulaAtSelection,
  type FormulaKind,
  type FormulaTarget,
} from './formulaInsertion';

/** Where the edited lines are on screen, in CSS pixels, so the equation editor can stay clear of them. */
export interface EditedLinesBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}

/** What the equation editor opens on. */
export interface FormulaEditRequest {
  readonly target: FormulaTarget;
  /** The source the equation editor starts with. */
  readonly source: string;
  /** The formula's own kind, or the kind asked for; undefined to use the kind the user chose last. */
  readonly kind: FormulaKind | undefined;
  /** A formula already in the text keeps its delimiters, so its kind cannot change. */
  readonly isExisting: boolean;
  readonly editedLines: EditedLinesBox | undefined;
}

/** Opens the app's equation editor; without one, formula commands insert an empty formula instead. */
export const formulaEditorFacet = Facet.define<
  (request: FormulaEditRequest) => void,
  ((request: FormulaEditRequest) => void) | undefined
>({ combine: (editors) => editors[0] });

const DISPLAY_DELIMITER = '$$';

function editedLinesOf(view: EditorView, from: number, to: number): EditedLinesBox | undefined {
  try {
    const left = view.coordsAtPos(from)?.left ?? view.contentDOM.getBoundingClientRect().left;
    return {
      top: view.documentTop + view.lineBlockAt(from).top,
      bottom: view.documentTop + view.lineBlockAt(to).bottom,
      left,
    };
  } catch {
    return undefined;
  }
}

function requestFor(view: EditorView, kind: FormulaKind | undefined): FormulaEditRequest {
  const formula = formulaAtSelection(view.state, kind ?? 'inline');
  const isExisting = formula.target.formula !== undefined;
  return {
    target: formula.target,
    source: formula.source,
    kind: isExisting ? formula.kind : kind,
    isExisting,
    editedLines: editedLinesOf(view, formula.target.from, formula.target.to),
  };
}

/**
 * Alt+=, Ctrl+Shift+M and the Math button: the equation editor opens on the formula at the caret,
 * or on a new one with the selection as its source.
 */
export function startFormula(kind: FormulaKind | undefined): Command {
  return (view) => {
    const openEquationEditor = view.state.facet(formulaEditorFacet);
    if (!openEquationEditor) {
      insertMenuItemAtSelection(view, kind === 'display' ? 'displayMath' : 'inlineMath');
      return true;
    }
    openEquationEditor(requestFor(view, kind));
    return true;
  };
}

/** A `$$` line that closes a formula, or sits in code, raw HTML or front matter, is not a formula start. */
const NODES_WHERE_DOLLARS_START_NO_FORMULA = new Set([
  'DisplayMath',
  'FencedCode',
  'CodeBlock',
  'HTMLBlock',
  'FrontMatter',
]);

function isWhereDollarsStartNoFormula(view: EditorView, position: number): boolean {
  const tree = ensureSyntaxTree(view.state, position) ?? syntaxTree(view.state);
  for (let node = tree.resolveInner(position, 1); node.parent; node = node.parent) {
    if (NODES_WHERE_DOLLARS_START_NO_FORMULA.has(node.name)) return true;
  }
  return false;
}

/** `$$` typed alone on a line, then Enter, opens the equation editor for a display formula there. */
export const startDisplayFormulaAfterDollars: Command = (view) => {
  const openEquationEditor = view.state.facet(formulaEditorFacet);
  const { main } = view.state.selection;
  if (!openEquationEditor || isComposing(view) || !main.empty) return false;
  const line = view.state.doc.lineAt(main.head);
  if (
    line.text.trim() !== DISPLAY_DELIMITER ||
    main.head !== line.to ||
    isWhereDollarsStartNoFormula(view, line.from + line.text.indexOf(DISPLAY_DELIMITER))
  )
    return false;
  openEquationEditor({
    target: { from: line.from, to: line.to, original: line.text },
    source: '',
    kind: 'display',
    isExisting: false,
    editedLines: editedLinesOf(view, line.from, line.to),
  });
  return true;
};

/** The first formula that starts at or after a position on its line, such as where a widget is drawn. */
function formulaFrom(view: EditorView, position: number): FormulaAtSelection | undefined {
  const lineEnd = view.state.doc.lineAt(position).to;
  let formulaStart: number | undefined;
  (ensureSyntaxTree(view.state, lineEnd) ?? syntaxTree(view.state)).iterate({
    from: position,
    to: lineEnd,
    enter: (node) => {
      if (formulaStart !== undefined) return false;
      if ((node.name === 'InlineMath' || node.name === 'DisplayMath') && node.from >= position)
        formulaStart = node.from;
      return undefined;
    },
  });
  return formulaStart === undefined ? undefined : formulaAt(view.state, formulaStart + 1);
}

function openOnFormula(view: EditorView, formula: FormulaAtSelection): void {
  view.state.facet(formulaEditorFacet)?.({
    target: formula.target,
    source: formula.source,
    kind: formula.kind,
    isExisting: true,
    editedLines: editedLinesOf(view, formula.target.from, formula.target.to),
  });
}

/** Where each formula of the document starts, in order. */
function formulaStarts(view: EditorView): number[] {
  const starts: number[] = [];
  (ensureSyntaxTree(view.state, view.state.doc.length) ?? syntaxTree(view.state)).iterate({
    enter: (node) => {
      if (node.name !== 'InlineMath' && node.name !== 'DisplayMath') return undefined;
      starts.push(node.from);
      return false;
    },
  });
  return starts;
}

/**
 * Edit Formula in the preview: the preview counts its formulas in the order the editor finds them,
 * so the formula at that place is taken when its source matches, otherwise the first that matches.
 */
export function editFormulaInOrder(view: EditorView, index: number, source: string): boolean {
  const formulas = formulaStarts(view)
    .map((start) => formulaAt(view.state, start + 1))
    .filter((formula): formula is FormulaAtSelection => formula !== undefined);
  const wanted = source.trim();
  const formula =
    [formulas[index], ...formulas].find((candidate) => candidate?.source === wanted) ?? formulas[index];
  if (!formula) return false;
  view.dispatch({ selection: EditorSelection.cursor(formula.target.from), scrollIntoView: true });
  view.focus();
  openOnFormula(view, formula);
  return true;
}

function isPlainPress(event: MouseEvent): boolean {
  return event.button === 0 && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
}

/**
 * A press on a rendered formula puts the caret at the start of its source, which shows the source,
 * and opens the equation editor on it. The press is mapped here because CodeMirror's own mapping puts
 * the caret at a widget's edge at best, and in WebView2 a press on a block formula moved no caret.
 */
export function editClickedFormula(event: MouseEvent, view: EditorView): boolean {
  const rendered = event.target instanceof Element ? event.target.closest(`.${FORMULA_CLASS}`) : null;
  if (!rendered || !isPlainPress(event) || !view.contentDOM.contains(rendered)) return false;
  const formula = formulaFrom(view, view.posAtDOM(rendered));
  if (!formula) return false;
  event.preventDefault();
  view.dispatch({ selection: EditorSelection.cursor(formula.target.from), userEvent: 'select.pointer' });
  view.focus();
  openOnFormula(view, formula);
  return true;
}
