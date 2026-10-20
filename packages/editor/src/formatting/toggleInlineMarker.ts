import { EditorSelection, type StateCommand } from '@codemirror/state';

/**
 * Wraps each selection in a marker such as `**`, or unwraps it when the marker is already there.
 * With nothing selected it inserts a pair of markers and puts the cursor between them.
 */
export function toggleInlineMarker(marker: string): StateCommand {
  const length = marker.length;
  return ({ state, dispatch }) => {
    const transaction = state.changeByRange((range) => {
      const isWrappedOutside =
        state.sliceDoc(range.from - length, range.from) === marker &&
        state.sliceDoc(range.to, range.to + length) === marker;
      if (isWrappedOutside) {
        return {
          changes: [
            { from: range.from - length, to: range.from },
            { from: range.to, to: range.to + length },
          ],
          range: EditorSelection.range(range.from - length, range.to - length),
        };
      }
      const selected = state.sliceDoc(range.from, range.to);
      if (selected.length >= length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
        return {
          changes: [
            { from: range.from, to: range.from + length },
            { from: range.to - length, to: range.to },
          ],
          range: EditorSelection.range(range.from, range.to - length * 2),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + length, range.to + length),
      };
    });
    dispatch(state.update(transaction, { userEvent: 'input.format', scrollIntoView: true }));
    return true;
  };
}
