import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownSyntax } from '../syntax/markdownSyntax';
import {
  formulaAt,
  formulaAtSelection,
  formulaInsertion,
  type FormulaInsertion,
  type FormulaKind,
  type FormulaTarget,
} from './formulaInsertion';

function stateWith(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdownSyntax(), history()],
  });
}

function writtenText(state: EditorState, insertion: FormulaInsertion): string {
  return insertion.outcome === 'written'
    ? state.update(insertion.spec).state.doc.toString()
    : `refused: ${insertion.refusal}`;
}

function textAfter(doc: string, caret: number, formula: { tex: string; kind: FormulaKind }): string {
  const state = stateWith(doc, caret);
  const { target } = formulaAtSelection(state, formula.kind);
  return writtenText(state, formulaInsertion(state, target, formula));
}

function textAfterInserting(doc: string, caret: number, tex: string): string {
  return textAfter(doc, caret, { tex, kind: 'inline' });
}

function textAfterInsertingDisplay(doc: string, caret: number, tex: string): string {
  return textAfter(doc, caret, { tex, kind: 'display' });
}

function textAfterEditing(doc: string, position: number, tex: string): string {
  const state = stateWith(doc, position);
  const formula = formulaAt(state, position);
  if (!formula) return 'no formula';
  return writtenText(state, formulaInsertion(state, formula.target, { tex, kind: formula.kind }));
}

describe('formula insertion', () => {
  it('inline formula after a word adds no space', () => {
    expect(textAfterInserting('Area is ', 8, '\\pi r^2')).toBe('Area is $\\pi r^2$');
    expect(textAfterInserting('Area', 4, 'x')).toBe('Area$x$');
  });

  it('a digit after the formula gets a space', () => {
    expect(textAfterInserting('5 cm', 0, 'x')).toBe('$x$ 5 cm');
  });

  it('a dollar amount nearby is untouched', () => {
    expect(textAfterInserting('Pay $5 now', 4, 'x')).toBe('Pay $x$$5 now');
    expect(textAfterInserting('Costs $5 and $10, area ', 23, 'a^2')).toMatch(/^Costs \$5 and \$10, area /);
  });

  it('a backslash before the formula gets a space, so the dollar is not escaped', () => {
    expect(textAfterInserting('path\\', 5, 'x')).toBe('path\\ $x$');
  });

  it('selection becomes the source', () => {
    const state = stateWith('Use a^2+b^2 here', 4, 11);

    const formula = formulaAtSelection(state, 'display');

    expect(formula.source).toBe('a^2+b^2');
    expect(formula.kind).toBe('display');
    expect(
      writtenText(state, formulaInsertion(state, formula.target, { tex: formula.source, kind: 'inline' })),
    ).toBe('Use $a^2+b^2$ here');
  });

  it('a display formula goes on lines of its own', () => {
    expect(textAfterInsertingDisplay('Before after', 6, 'x')).toBe('Before\n$$\nx\n$$\n after');
    expect(textAfterInsertingDisplay('', 0, 'x')).toBe('$$\nx\n$$');
  });

  it('editing replaces only the source', () => {
    const doc = 'Area $x^2$ here and $$\n  y \n$$';

    expect(formulaAt(stateWith(doc, 7), 7)?.source).toBe('x^2');
    expect(formulaAt(stateWith(doc, 25), 25)).toMatchObject({ source: 'y', kind: 'display' });
    expect(textAfterEditing(doc, 7, 'x^3')).toBe('Area $x^3$ here and $$\n  y \n$$');
    expect(textAfterEditing(doc, 25, 'z')).toBe('Area $x^2$ here and $$\n  z \n$$');
  });

  it('a caret just after a formula starts a new one', () => {
    expect(formulaAt(stateWith('$x$ ', 3), 3)).toBeUndefined();
    expect(formulaAt(stateWith('$x$ ', 2), 2)?.source).toBe('x');
  });

  it('refuses to write when the text at the target changed', () => {
    const state = stateWith('Area $x$', 6);
    const target: FormulaTarget | undefined = formulaAt(state, 6)?.target;
    const changed = state.update({ changes: { from: 6, to: 7, insert: 'y' } }).state;

    expect(target && formulaInsertion(changed, target, { tex: 'z', kind: 'inline' })).toEqual({
      outcome: 'refused',
      refusal: 'textChanged',
    });
  });

  it('an empty source writes nothing', () => {
    expect(textAfterInserting('Area ', 5, '   ')).toBe('refused: emptySource');
  });

  it('an inline source whose dollar would end the formula early is refused', () => {
    expect(textAfterInserting('Cost ', 5, 'a$ b')).toBe('refused: dollarEndsInlineFormula');
    expect(textAfterEditing('Area $x$ here', 6, 'x$ y')).toBe('refused: dollarEndsInlineFormula');
  });

  it('an escaped dollar in an inline source is kept as part of the formula', () => {
    expect(textAfterInserting('Cost ', 5, 'a\\$b')).toBe('Cost $a\\$b$');
    expect(textAfterEditing('Area $x$ here', 6, 'x\\$y')).toBe('Area $x\\$y$ here');
  });

  it('a display source with a line ending in $$ is refused', () => {
    expect(textAfterInsertingDisplay('', 0, 'a\n$$\nb')).toBe('refused: dollarsEndDisplayFormula');
    expect(textAfterEditing('$$\ny\n$$', 3, 'a$$\nb')).toBe('refused: dollarsEndDisplayFormula');
  });

  it('one undo removes the formula', () => {
    const state = stateWith('Text', 4);
    const { target } = formulaAtSelection(state, 'display');
    const insertion = formulaInsertion(state, target, { tex: '\\sum_i i', kind: 'display' });
    let after = insertion.outcome === 'written' ? state.update(insertion.spec).state : state;

    undo({ state: after, dispatch: (transaction) => (after = transaction.state) });

    expect(after.doc.toString()).toBe('Text');
  });
});
