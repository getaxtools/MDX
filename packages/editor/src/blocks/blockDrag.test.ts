import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownSyntax } from '../syntax/markdownSyntax';
import { blockMoveToGap, nearestGapIndex } from './blockDrag';

const THREE_PARAGRAPHS = 'A\n\nB\n\nC\n';

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownSyntax(), history()] });
}

function textAfterMoving(doc: string, position: number, gapIndex: number): string {
  const state = stateOf(doc);
  const spec = blockMoveToGap(state, position, gapIndex);
  return spec ? state.update(spec).state.doc.toString() : 'unchanged';
}

describe('dragging blocks', () => {
  it('drop gap from coordinates picks the nearest block boundary', () => {
    const boxes = [
      { top: 0, bottom: 20 },
      { top: 30, bottom: 50 },
      { top: 60, bottom: 80 },
    ];

    expect(nearestGapIndex(boxes, 5)).toBe(0);
    expect(nearestGapIndex(boxes, 15)).toBe(1);
    expect(nearestGapIndex(boxes, 45)).toBe(2);
    expect(nearestGapIndex(boxes, 75)).toBe(3);
    expect(nearestGapIndex(boxes, 400)).toBe(3);
  });

  it('a block dropped below the last block goes to the end', () => {
    expect(textAfterMoving(THREE_PARAGRAPHS, 0, 3)).toBe('B\n\nC\n\nA\n');
  });

  it('a block dropped above the first block goes to the start', () => {
    expect(textAfterMoving(THREE_PARAGRAPHS, 6, 0)).toBe('C\n\nA\n\nB\n');
  });

  it('a block dropped next to itself does not move', () => {
    expect(textAfterMoving(THREE_PARAGRAPHS, 3, 1)).toBe('unchanged');
    expect(textAfterMoving(THREE_PARAGRAPHS, 3, 2)).toBe('unchanged');
  });

  it('a list item moves among the items of its list', () => {
    expect(textAfterMoving('- one\n- two\n- three\n\nAfter\n', 0, 3)).toBe(
      '- two\n- three\n- one\n\nAfter\n',
    );
  });

  it('undo restores the order in one step', () => {
    const state = stateOf(THREE_PARAGRAPHS);
    const spec = blockMoveToGap(state, 0, 3);
    let after = spec ? state.update(spec).state : state;

    undo({ state: after, dispatch: (transaction) => (after = transaction.state) });

    expect(after.doc.toString()).toBe(THREE_PARAGRAPHS);
  });
});
