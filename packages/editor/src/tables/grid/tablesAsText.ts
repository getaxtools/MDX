import { StateEffect, StateField, type EditorState, type TransactionSpec } from '@codemirror/state';
import { isTouchedBySelection } from '../../rich-text/revealRule';
import { tableAt } from '../tableCells';

const showTableAsText = StateEffect.define<number>();

/**
 * Where the tables shown as Markdown start: Edit table as text adds the table at the caret, and a
 * table leaves the set once no selection touches it, so the grid comes back.
 */
export const tablesAsText = StateField.define<readonly number[]>({
  create: () => [],
  update: (starts, transaction) => {
    let updated = starts.map((start) => transaction.changes.mapPos(start, 1));
    for (const effect of transaction.effects) {
      if (effect.is(showTableAsText) && !updated.includes(effect.value)) updated = [...updated, effect.value];
    }
    if (!transaction.selection && !transaction.docChanged) return updated;
    return updated.filter((start) => {
      const table = tableAt(transaction.state, start);
      return table !== undefined && isTouchedBySelection(transaction.state.selection, table.from, table.to);
    });
  },
});

export function isTableShownAsText(state: EditorState, tableFrom: number): boolean {
  return state.field(tablesAsText, false)?.includes(tableFrom) === true;
}

/**
 * Edit table as text: the table at the caret shows its Markdown until the caret leaves it. The
 * selection is set again, unchanged, so Rich text looks at the table anew.
 */
export function tableAsTextAtCaret(state: EditorState): TransactionSpec | undefined {
  const table = tableAt(state, state.selection.main.head);
  return table ? { effects: showTableAsText.of(table.from), selection: state.selection } : undefined;
}
