import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, Text, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { SyntaxNode } from '../syntax/syntaxNode';
import { markdownSyntax } from '../syntax/markdownSyntax';

export type FormulaKind = 'inline' | 'display';

/** Where the equation editor writes its formula. */
export interface FormulaTarget {
  /** The selection for a new formula, or the source between the delimiters of a formula in the text. */
  readonly from: number;
  readonly to: number;
  /** What the range held when the equation editor opened; the insert is refused once it changed. */
  readonly original: string;
  /** For a formula already in the text: where it starts and ends, delimiters included. */
  readonly formula?: { readonly from: number; readonly to: number };
}

export interface FormulaAtSelection {
  readonly target: FormulaTarget;
  readonly kind: FormulaKind;
  readonly source: string;
}

/**
 * Why a formula was not written: nothing to write, the text at the target changed since the
 * equation editor opened, a dollar sign or line break would end an inline formula early, or a line
 * ending in `$$` would end a display formula early.
 */
export type FormulaRefusal =
  'emptySource' | 'textChanged' | 'dollarEndsInlineFormula' | 'dollarsEndDisplayFormula';

export type FormulaInsertion =
  | { readonly outcome: 'written'; readonly spec: TransactionSpec }
  | { readonly outcome: 'refused'; readonly refusal: FormulaRefusal };

const INLINE_DELIMITER = '$';
const DISPLAY_DELIMITER = '$$';
const PARSE_TIMEOUT_MS = 200;
/** Spaces tried around a new inline formula, fewest first, until the dollar rule reads it as math. */
const INLINE_SPACINGS: readonly (readonly [string, string])[] = [
  ['', ''],
  ['', ' '],
  [' ', ''],
  [' ', ' '],
];
/** Characters that can end an inline formula before its closing dollar. */
const INLINE_ENDING_CHARACTERS = /[$\n]/;

function treeOf(state: EditorState, upTo: number) {
  return ensureSyntaxTree(state, upTo, PARSE_TIMEOUT_MS) ?? syntaxTree(state);
}

/** A caret holds a formula only strictly inside it, so a caret just after `$x$` starts a new one. */
function holds(node: SyntaxNode, from: number, to: number): boolean {
  return from === to ? node.from < from && from < node.to : node.from <= from && to <= node.to;
}

function formulaNodeAround(state: EditorState, from: number, to: number): SyntaxNode | undefined {
  for (let node: SyntaxNode | null = treeOf(state, to).resolveInner(from, 1); node; node = node.parent) {
    if ((node.name === 'InlineMath' || node.name === 'DisplayMath') && holds(node, from, to)) return node;
  }
  return undefined;
}

/** The formula whose text holds a position or range, as the equation editor edits it. */
export function formulaAt(state: EditorState, from: number, to = from): FormulaAtSelection | undefined {
  const node = formulaNodeAround(state, from, to);
  const marks = node?.getChildren('MathMark') ?? [];
  const opening = marks[0];
  const closing = marks.at(-1);
  if (!node || !opening || !closing || opening === closing) return undefined;
  const between = state.sliceDoc(opening.to, closing.from);
  const leading = between.length - between.trimStart().length;
  const trailing = between.length - between.trimEnd().length;
  const sourceFrom = opening.to + leading;
  const sourceTo = Math.max(sourceFrom, closing.from - trailing);
  const source = state.sliceDoc(sourceFrom, sourceTo);
  const isDisplay = node.name === 'DisplayMath' || opening.to - opening.from === DISPLAY_DELIMITER.length;
  return {
    target: { from: sourceFrom, to: sourceTo, original: source, formula: { from: node.from, to: node.to } },
    kind: isDisplay ? 'display' : 'inline',
    source,
  };
}

/** The formula at the main selection, or a new one whose source is the selected text. */
export function formulaAtSelection(state: EditorState, kind: FormulaKind): FormulaAtSelection {
  const { from, to } = state.selection.main;
  const existing = formulaAt(state, from, to);
  if (existing) return existing;
  const selected = state.sliceDoc(from, to);
  return { target: { from, to, original: selected }, kind, source: selected.trim() };
}

function refused(refusal: FormulaRefusal): FormulaInsertion {
  return { outcome: 'refused', refusal };
}

/**
 * One transaction that writes a formula: an existing formula's source is replaced between its
 * delimiters, keeping its kind; a new one goes at the target.
 */
export function formulaInsertion(
  state: EditorState,
  target: FormulaTarget,
  { tex, kind }: { readonly tex: string; readonly kind: FormulaKind },
): FormulaInsertion {
  const source = tex.trim();
  if (source === '') return refused('emptySource');
  if (state.sliceDoc(target.from, target.to) !== target.original) return refused('textChanged');
  if (target.formula) return existingFormulaChange(state, { target, formula: target.formula, kind }, source);
  return kind === 'display'
    ? newDisplayFormula(state, target, source)
    : newInlineFormula(state, target, source);
}

/** The display rule closes a formula at the first line that ends in `$$`. */
function hasLineEndingTheDisplayFormula(source: string): boolean {
  return source.split('\n').some((line) => line.trimEnd().endsWith(DISPLAY_DELIMITER));
}

function existingFormulaChange(
  state: EditorState,
  {
    target,
    formula,
    kind,
  }: {
    readonly target: FormulaTarget;
    readonly formula: { readonly from: number; readonly to: number };
    /** The formula's own kind, which the equation editor keeps for a formula in the text. */
    readonly kind: FormulaKind;
  },
  source: string,
): FormulaInsertion {
  const change = { from: target.from, to: target.to, insert: source };
  const formulaEnd = formula.to + source.length - target.original.length;
  const isDisplay = kind === 'display';
  if (isDisplay && hasLineEndingTheDisplayFormula(source)) return refused('dollarsEndDisplayFormula');
  const isInlineCheckNeeded = !isDisplay && INLINE_ENDING_CHARACTERS.test(source);
  if (isInlineCheckNeeded && !readsAsInlineFormula(state, change, { from: formula.from, to: formulaEnd }))
    return refused('dollarEndsInlineFormula');
  return written({ changes: change, selection: EditorSelection.cursor(formulaEnd) });
}

function written(spec: TransactionSpec): FormulaInsertion {
  return { outcome: 'written', spec: { ...spec, userEvent: 'input.formula', scrollIntoView: true } };
}

function newDisplayFormula(state: EditorState, target: FormulaTarget, source: string): FormulaInsertion {
  if (hasLineEndingTheDisplayFormula(source)) return refused('dollarsEndDisplayFormula');
  const firstLine = state.doc.lineAt(target.from);
  const lastLine = state.doc.lineAt(target.to);
  const hasTextBefore = state.sliceDoc(firstLine.from, target.from).trim() !== '';
  const hasTextAfter = state.sliceDoc(target.to, lastLine.to).trim() !== '';
  const formula = `${DISPLAY_DELIMITER}\n${source}\n${DISPLAY_DELIMITER}`;
  const insert = `${hasTextBefore ? '\n' : ''}${formula}${hasTextAfter ? '\n' : ''}`;
  return written({
    changes: { from: target.from, to: target.to, insert },
    selection: EditorSelection.cursor(target.from + insert.length),
  });
}

/**
 * Spaces go around a new inline formula only where the dollar rule needs them. A source whose own
 * dollar sign or line break the rule reads as the formula's end is refused; with neither, a formula
 * that still cannot be read alone, such as after an unpaired dollar earlier in the line, is written.
 */
function newInlineFormula(state: EditorState, target: FormulaTarget, source: string): FormulaInsertion {
  const formula = `${INLINE_DELIMITER}${source}${INLINE_DELIMITER}`;
  const placementWith = ([before, after]: readonly [string, string]) => ({
    change: { from: target.from, to: target.to, insert: `${before}${formula}${after}` },
    formulaRange: { from: target.from + before.length, to: target.from + before.length + formula.length },
  });
  const readable = INLINE_SPACINGS.map(placementWith).find(({ change, formulaRange }) =>
    readsAsInlineFormula(state, change, formulaRange),
  );
  if (!readable && INLINE_ENDING_CHARACTERS.test(source)) return refused('dollarEndsInlineFormula');
  const { change, formulaRange } = readable ?? placementWith(['', '']);
  return written({ changes: change, selection: EditorSelection.cursor(formulaRange.to) });
}

/** Parses the lines of the changed text that hold the formula, to check that its dollars make exactly it. */
function readsAsInlineFormula(
  state: EditorState,
  change: { readonly from: number; readonly to: number; readonly insert: string },
  formula: { readonly from: number; readonly to: number },
): boolean {
  const doc = state.doc.replace(change.from, change.to, Text.of(change.insert.split('\n')));
  const linesFrom = doc.lineAt(formula.from).from;
  const text = doc.sliceString(linesFrom, doc.lineAt(formula.to).to);
  let isFound = false;
  markdownSyntax()
    .language.parser.parse(text)
    .iterate({
      enter: (node) => {
        isFound ||=
          node.name === 'InlineMath' &&
          node.from === formula.from - linesFrom &&
          node.to === formula.to - linesFrom;
        return !isFound;
      },
    });
  return isFound;
}
