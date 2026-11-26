import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isComposing } from '../rich-text/compositionHold';
import { snippetInsertion } from '../snippets/snippetFields';

/** The term a slash divides: a command, a number or word, or a group in braces or parentheses. */
const TERM_BEFORE_CARET = /(?:\\[A-Za-z]+|[A-Za-z0-9.]+|\{[^{}]*\}|\([^()]*\))$/;
const FRACTION_OPENING = String.raw`\frac{`;

/**
 * When it is on, a slash typed after a term turns the term into a fraction's numerator and puts the
 * caret in its denominator, so typing `a/b` gives `\frac{a}{b}`.
 */
export function automaticFractions(isOn: () => boolean): Extension {
  return EditorView.inputHandler.of((view, ...[from, to, text]) => {
    if (text !== '/' || from !== to || !isOn() || isComposing(view)) return false;
    const line = view.state.doc.lineAt(from);
    const term = TERM_BEFORE_CARET.exec(line.text.slice(0, from - line.from))?.[0];
    if (term === undefined) return false;
    const fraction = `${FRACTION_OPENING}${term}}{}`;
    const denominator = fraction.length - 1;
    view.dispatch(
      snippetInsertion(view.state, { from: from - term.length, to: from }, () => ({
        text: fraction,
        fields: [{ from: denominator, to: denominator }],
      })),
    );
    return true;
  });
}
