import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import { Decoration, EditorView, keymap, type Command, type DecorationSet } from '@codemirror/view';

/** Snippet text with its numbered fields, in the order Tab visits them. */
export interface ExpandedSnippetText {
  readonly text: string;
  readonly fields: readonly { readonly from: number; readonly to: number }[];
}

/** Turns the selected text into the snippet's text, so `{{selection}}` can use it. */
export type SnippetExpander = (selectedText: string) => ExpandedSnippetText;

interface FieldRange {
  readonly from: number;
  readonly to: number;
}

interface FieldMode {
  readonly fields: readonly FieldRange[];
  readonly active: number;
}

const setFieldMode = StateEffect.define<FieldMode | null>();
const fieldMark = Decoration.mark({ class: 'cm-snippet-field' });

const fieldModeState = StateField.define<FieldMode | null>({
  create: () => null,
  update(mode, transaction) {
    // Fields set by this transaction already use its new positions; only older ones are mapped.
    let next =
      mode && transaction.docChanged
        ? {
            ...mode,
            fields: mode.fields.map((field) => ({
              from: transaction.changes.mapPos(field.from, -1),
              to: transaction.changes.mapPos(field.to, 1),
            })),
          }
        : mode;
    for (const effect of transaction.effects) if (effect.is(setFieldMode)) next = effect.value;
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (mode): DecorationSet =>
      mode
        ? Decoration.set(
            mode.fields
              .filter((range) => range.to > range.from)
              .map((range) => fieldMark.range(range.from, range.to)),
            true,
          )
        : Decoration.none,
    ),
});

/** Field mode: Tab and Shift+Tab move between fields; Escape or leaving the last field ends it. */
export function snippetFields(): Extension {
  return [
    fieldModeState,
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: moveToField(1) },
        { key: 'Shift-Tab', run: moveToField(-1) },
        { key: 'Escape', run: endFieldMode },
      ]),
    ),
  ];
}

/** Replaces the range with the snippet text, selects its first field and starts field mode. */
export function snippetInsertion(
  state: EditorState,
  range: FieldRange,
  expand: SnippetExpander,
): TransactionSpec {
  const { text, fields } = expand(state.sliceDoc(range.from, range.to));
  const placed = fields.map((field) => ({ from: range.from + field.from, to: range.from + field.to }));
  const first = placed[0];
  return {
    changes: { from: range.from, to: range.to, insert: text },
    selection: first
      ? EditorSelection.single(first.from, first.to)
      : EditorSelection.cursor(range.from + text.length),
    effects: setFieldMode.of(placed.length > 0 ? { fields: placed, active: 0 } : null),
    userEvent: 'input.complete',
    scrollIntoView: true,
  };
}

function moveToField(step: 1 | -1): Command {
  return (view) => {
    const mode = view.state.field(fieldModeState, false);
    if (!mode) return false;
    const target = mode.fields[mode.active + step];
    if (!target) {
      view.dispatch({ effects: setFieldMode.of(null) });
      return step === -1;
    }
    view.dispatch({
      selection: EditorSelection.single(target.from, target.to),
      effects: setFieldMode.of({ ...mode, active: mode.active + step }),
      scrollIntoView: true,
    });
    return true;
  };
}

const endFieldMode: Command = (view) => {
  if (!view.state.field(fieldModeState, false)) return false;
  view.dispatch({ effects: setFieldMode.of(null) });
  return true;
};

export function isInFieldMode(state: EditorState): boolean {
  return state.field(fieldModeState, false) != null;
}
