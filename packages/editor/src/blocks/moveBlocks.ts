import type { EditorState, TransactionSpec } from '@codemirror/state';
import { EditorView, type Command } from '@codemirror/view';
import { siblingBlocksAt, type BlockKind, type MarkdownBlock } from './markdownBlocks';

export type MoveDirection = 'up' | 'down';

export type BlockMove =
  | { readonly outcome: 'moved'; readonly kind: BlockKind; readonly spec: TransactionSpec }
  | { readonly outcome: 'atEdge'; readonly direction: MoveDirection };

/** CodeMirror's own words for block kinds, translated through the editor phrases. */
export const BLOCK_KIND_PHRASES: Readonly<Record<BlockKind, string>> = {
  paragraph: 'paragraph',
  heading: 'heading',
  list: 'list',
  listItem: 'list item',
  codeBlock: 'code block',
  table: 'table',
  quote: 'quote',
  mathBlock: 'math block',
  htmlBlock: 'HTML block',
  horizontalRule: 'horizontal rule',
};

export const BLOCK_MOVE_PHRASES = {
  movedUp: 'Moved $1 up.',
  movedDown: 'Moved $1 down.',
  first: 'This is the first block.',
  last: 'This is the last block.',
} as const;

/**
 * Swaps the blocks under the selection with the block before or after them, keeping the blank lines
 * between them where they were, so moving up and then down gives back the same text.
 */
export function blockMove(state: EditorState, direction: MoveDirection): BlockMove | undefined {
  const { from, to } = state.selection.main;
  const siblings = siblingBlocksAt(state, from);
  if (!siblings) return undefined;
  const { blocks, index: firstIndex } = siblings;
  const lastIndex = lastIndexCovering(blocks, firstIndex, to);
  const neighbourIndex = direction === 'up' ? firstIndex - 1 : lastIndex + 1;
  const neighbour = blocks[neighbourIndex];
  const firstBlock = blocks[firstIndex];
  const lastBlock = blocks[lastIndex];
  if (!firstBlock || !lastBlock) return undefined;
  if (!neighbour) return { outcome: 'atEdge', direction };
  const moving = { from: firstBlock.from, to: lastBlock.to };
  return {
    outcome: 'moved',
    kind: firstBlock.kind,
    spec: direction === 'up' ? swapUp(state, moving, neighbour) : swapDown(state, moving, neighbour),
  };
}

export function moveBlockCommand(direction: MoveDirection): Command {
  return (view) => {
    if (view.composing) return false;
    const move = blockMove(view.state, direction);
    if (!move) return false;
    const announcement = EditorView.announce.of(moveAnnouncement(view.state, move));
    view.dispatch(
      move.outcome === 'moved' ? { ...move.spec, effects: announcement } : { effects: announcement },
    );
    return true;
  };
}

export function moveAnnouncement(state: EditorState, move: BlockMove): string {
  if (move.outcome === 'atEdge') {
    return state.phrase(move.direction === 'up' ? BLOCK_MOVE_PHRASES.first : BLOCK_MOVE_PHRASES.last);
  }
  const kind = state.phrase(BLOCK_KIND_PHRASES[move.kind]);
  const isUp = move.spec.userEvent === 'move.block.up';
  return state.phrase(isUp ? BLOCK_MOVE_PHRASES.movedUp : BLOCK_MOVE_PHRASES.movedDown, kind);
}

function lastIndexCovering(blocks: readonly MarkdownBlock[], firstIndex: number, position: number): number {
  let lastIndex = firstIndex;
  while ((blocks[lastIndex + 1]?.from ?? Infinity) <= position) lastIndex += 1;
  return lastIndex;
}

interface LineRange {
  readonly from: number;
  readonly to: number;
}

function swapUp(state: EditorState, moving: LineRange, above: LineRange): TransactionSpec {
  const { doc, selection } = state;
  const gap = doc.sliceString(above.to, moving.from);
  const insert = doc.sliceString(moving.from, moving.to) + gap + doc.sliceString(above.from, above.to);
  const shift = above.from - moving.from;
  return {
    changes: { from: above.from, to: moving.to, insert },
    selection: { anchor: selection.main.anchor + shift, head: selection.main.head + shift },
    scrollIntoView: true,
    userEvent: 'move.block.up',
  };
}

function swapDown(state: EditorState, moving: LineRange, below: LineRange): TransactionSpec {
  const { doc, selection } = state;
  const gap = doc.sliceString(moving.to, below.from);
  const belowText = doc.sliceString(below.from, below.to);
  const insert = belowText + gap + doc.sliceString(moving.from, moving.to);
  const shift = belowText.length + gap.length;
  return {
    changes: { from: moving.from, to: below.to, insert },
    selection: { anchor: selection.main.anchor + shift, head: selection.main.head + shift },
    scrollIntoView: true,
    userEvent: 'move.block.down',
  };
}
