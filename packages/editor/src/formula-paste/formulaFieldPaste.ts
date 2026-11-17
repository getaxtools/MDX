import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { checkedTex } from './formulaMarkdown';
import { texOfMathml } from './mathmlToTex';
import { isFormula, type FoundFormula, type PastePiece } from './pastePieces';
import { readClipboardFormulas } from './readClipboardFormulas';

export type FormulaTypesetCheck = (tex: string, isDisplay: boolean) => Promise<boolean>;

const IS_TYPESET_UNCHECKED: FormulaTypesetCheck = () => Promise.resolve(true);

/** The one formula of a paste that holds nothing else but spacing. */
function onlyFormulaOf(pieces: readonly PastePiece[]): FoundFormula | undefined {
  const formulas = pieces.filter(isFormula);
  const isOnlyFormula = pieces.every((piece) => typeof piece !== 'string' || piece.trim() === '');
  return formulas.length === 1 && isOnlyFormula ? formulas[0] : undefined;
}

function insertText(view: EditorView, text: string): void {
  if (text !== '')
    view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
}

/**
 * Pasting one formula into the equation editor's source field gives its TeX without delimiters,
 * converted and checked as in the document; anything else pastes as usual.
 */
export function formulaFieldPaste(isTypeset: FormulaTypesetCheck = IS_TYPESET_UNCHECKED): Extension {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const clipboard = event.clipboardData;
      if (!clipboard) return false;
      const plainText = clipboard.getData('text/plain');
      const formulas = readClipboardFormulas({ text: plainText, html: clipboard.getData('text/html') });
      const formula = formulas.kind === 'formulas' ? onlyFormulaOf(formulas.pieces) : undefined;
      if (!formula) return false;
      event.preventDefault();
      void checkedTex(formula, { texOfMathml, isTypeset }).then((tex) => insertText(view, tex ?? plainText));
      return true;
    },
  });
}
