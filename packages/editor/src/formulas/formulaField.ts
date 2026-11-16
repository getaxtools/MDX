import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { isComposing } from '../rich-text/compositionHold';

export interface FormulaFieldOptions {
  readonly parent: HTMLElement;
  readonly text: string;
  readonly label: string;
  /** The ids of the elements that describe the field, such as the error and the keys hint. */
  readonly describedBy: string;
  readonly onChange: (text: string) => void;
  /** Enter, when `isEnterInserting` says so; Ctrl+Enter is left to the dialog. */
  readonly onInsert: () => void;
  /** True for an inline formula, where Enter inserts; a display formula takes Enter as a line break. */
  readonly isEnterInserting: () => boolean;
}

/** The equation editor's TeX source field. */
export interface FormulaField {
  focus(): void;
  text(): string;
  /** Underlines the character a typesetting error is at, or removes the underline. */
  markError(position: number | undefined): void;
  destroy(): void;
}

const ERROR_CLASS = 'cm-formula-error';
const markErrorAt = StateEffect.define<number | undefined>();
const errorMark = Decoration.mark({ class: ERROR_CLASS });

const errorMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (marks, transaction) => {
    let updated = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(markErrorAt)) updated = errorMarkAt(transaction.state, effect.value);
    }
    return updated;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** An error at the end of the source, such as a missing brace, marks the last character. */
function errorMarkAt(state: EditorState, position: number | undefined): DecorationSet {
  const length = state.doc.length;
  if (position === undefined || length === 0) return Decoration.none;
  const from = Math.min(Math.max(position, 0), length - 1);
  return Decoration.set([errorMark.range(from, from + 1)]);
}

const fieldTheme = EditorView.theme({
  '&': { maxHeight: '10rem' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
  [`.${ERROR_CLASS}`]: {
    textDecoration: 'underline wavy',
    textDecorationColor: 'var(--color-alert-caution)',
  },
});

/** Ctrl+Enter and Escape are left to the dialog, which also handles them outside the field. */
function fieldKeymap(options: FormulaFieldOptions): Extension {
  const insertOnEnter = (view: EditorView): boolean => {
    if (isComposing(view) || !options.isEnterInserting()) return false;
    options.onInsert();
    return true;
  };
  return keymap.of([
    { key: 'Enter', run: insertOnEnter },
    ...closeBracketsKeymap,
    ...historyKeymap,
    ...defaultKeymap.filter((binding) => binding.key !== 'Mod-Enter' && binding.key !== 'Escape'),
  ]);
}

export function createFormulaField(options: FormulaFieldOptions): FormulaField {
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        history(),
        closeBrackets(),
        EditorView.lineWrapping,
        errorMarks,
        fieldTheme,
        EditorView.contentAttributes.of({
          'aria-label': options.label,
          'aria-describedby': options.describedBy,
          'aria-multiline': 'true',
          spellcheck: 'false',
        }),
        fieldKeymap(options),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
        }),
      ],
      selection: { anchor: options.text.length },
    }),
  });
  return {
    focus: () => view.focus(),
    text: () => view.state.doc.toString(),
    markError: (position) => view.dispatch({ effects: markErrorAt.of(position) }),
    destroy: () => view.destroy(),
  };
}
