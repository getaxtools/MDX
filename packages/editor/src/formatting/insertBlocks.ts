import { EditorSelection, type StateCommand } from '@codemirror/state';

const URL_LIKE = /^(?:https?:|mailto:)\S+$/;
const FENCE = '```';
const HORIZONTAL_RULE = '---';

/**
 * Turns the selection into a link: selected text becomes the link text with the cursor in the
 * address, a selected address becomes the target with the cursor in the text.
 */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const transaction = state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);
    if (URL_LIKE.test(selected)) {
      return {
        changes: { from: range.from, to: range.to, insert: `[](${selected})` },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const insert = `[${selected}]()`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length - 1),
    };
  });
  dispatch(state.update(transaction, { userEvent: 'input.format', scrollIntoView: true }));
  return true;
};

/** Fences the selected lines as a code block, or opens an empty one at the cursor. */
export const insertCodeBlock: StateCommand = ({ state, dispatch }) => {
  const { from, to } = state.selection.main;
  const firstLine = state.doc.lineAt(from);
  const lastLine = state.doc.lineAt(to);
  const isEmpty = from === to && firstLine.text.trim() === '';
  const changes = isEmpty
    ? { from: firstLine.from, to: firstLine.to, insert: `${FENCE}\n\n${FENCE}` }
    : [
        { from: firstLine.from, insert: `${FENCE}\n` },
        { from: lastLine.to, insert: `\n${FENCE}` },
      ];
  const cursor = isEmpty ? firstLine.from + FENCE.length + 1 : firstLine.from + FENCE.length;
  dispatch(
    state.update({
      changes,
      selection: EditorSelection.cursor(cursor),
      userEvent: 'input.format',
      scrollIntoView: true,
    }),
  );
  return true;
};

/** Adds a horizontal rule on its own line after the cursor's line. */
export const insertHorizontalRule: StateCommand = ({ state, dispatch }) => {
  const line = state.doc.lineAt(state.selection.main.head);
  const isEmpty = line.text.trim() === '';
  const insert = isEmpty ? `${HORIZONTAL_RULE}\n` : `\n\n${HORIZONTAL_RULE}\n`;
  const from = isEmpty ? line.from : line.to;
  dispatch(
    state.update({
      changes: { from, to: line.to, insert },
      selection: EditorSelection.cursor(from + insert.length),
      userEvent: 'input.format',
      scrollIntoView: true,
    }),
  );
  return true;
};
