import type { ChangeSet, EditorState, TransactionSpec } from '@codemirror/state';
import { blockMove, type MoveDirection } from './moveBlocks';
import { siblingBlocksAt } from './markdownBlocks';

/** Where a block is on screen, top to bottom, in the same coordinates as the pointer. */
export interface BlockBox {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The gap nearest to a pointer height among blocks laid out top to bottom: 0 is before the first
 * block, `boxes.length` after the last. A pointer over a block's upper half is nearest the gap above it.
 */
export function nearestGapIndex(boxes: readonly BlockBox[], pointerY: number): number {
  const index = boxes.findIndex((box) => pointerY < (box.top + box.bottom) / 2);
  return index === -1 ? boxes.length : index;
}

/**
 * Moves the block at a position into a gap between its sibling blocks as one transaction. The move
 * is made of the same swaps as moving the block with the keys, so the blank lines between blocks stay
 * where they were; undefined when the block would not move.
 */
export function blockMoveToGap(
  state: EditorState,
  position: number,
  gapIndex: number,
): TransactionSpec | undefined {
  const siblings = siblingBlocksAt(state, position);
  if (!siblings) return undefined;
  const { index } = siblings;
  const isUp = gapIndex <= index;
  const steps = isUp ? index - gapIndex : gapIndex - index - 1;
  if (steps === 0) return undefined;
  const start = siblings.blocks[index]?.from ?? position;
  return composedMoves(state.update({ selection: { anchor: start } }).state, isUp ? 'up' : 'down', steps);
}

/** The keyboard moves of the block at the caret, repeated, as the changes of one transaction. */
function composedMoves(
  state: EditorState,
  direction: MoveDirection,
  steps: number,
): TransactionSpec | undefined {
  let current = state;
  let changes: ChangeSet | undefined;
  for (let step = 0; step < steps; step += 1) {
    const move = blockMove(current, direction);
    if (move?.outcome !== 'moved') break;
    const transaction = current.update(move.spec);
    changes = changes ? changes.compose(transaction.changes) : transaction.changes;
    current = transaction.state;
  }
  if (!changes) return undefined;
  return { changes, selection: current.selection, userEvent: 'move.block.drag', scrollIntoView: true };
}
