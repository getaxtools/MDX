import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { blockMove } from './moveBlocks';
import { siblingBlocksAt, type MarkdownBlock } from './markdownBlocks';

export type TurnIntoKind =
  'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'bulletList' | 'codeBlock';

export type BlockAction = 'moveUp' | 'moveDown' | 'duplicate' | 'delete' | `turnInto.${TurnIntoKind}`;

export const TURN_INTO_KINDS: readonly TurnIntoKind[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'quote',
  'bulletList',
  'codeBlock',
];

/** Heading, quote and list markers at the start of a line, removed before another kind is applied. */
const LINE_MARKERS = /^(\s{0,3})(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;
const FENCE = '```';

const LINE_PREFIXES: Readonly<Record<Exclude<TurnIntoKind, 'codeBlock'>, string>> = {
  paragraph: '',
  heading1: '# ',
  heading2: '## ',
  heading3: '### ',
  quote: '> ',
  bulletList: '- ',
};

/** The block at the caret, which the block menu acts on. */
export function blockAtCaret(state: EditorState): MarkdownBlock | undefined {
  const siblings = siblingBlocksAt(state, state.selection.main.head);
  return siblings?.blocks[siblings.index];
}

/** What a block menu choice changes; undefined when there is no block at the caret. */
export function blockAction(state: EditorState, action: BlockAction): TransactionSpec | undefined {
  if (action === 'moveUp' || action === 'moveDown') {
    const move = blockMove(state, action === 'moveUp' ? 'up' : 'down');
    return move?.outcome === 'moved' ? move.spec : undefined;
  }
  const block = blockAtCaret(state);
  if (!block) return undefined;
  if (action === 'duplicate') return duplicate(state, block);
  if (action === 'delete') return remove(state, block);
  return turnInto(state, block, action.slice('turnInto.'.length) as TurnIntoKind);
}

/** An exact copy goes below the block, separated as list items or blocks are. */
function duplicate(state: EditorState, block: MarkdownBlock): TransactionSpec {
  const text = state.sliceDoc(block.from, block.to);
  const gap = block.kind === 'listItem' ? '\n' : '\n\n';
  const copyStart = block.to + gap.length;
  return {
    changes: { from: block.to, insert: gap + text },
    selection: EditorSelection.cursor(copyStart),
    userEvent: 'input.duplicate',
    scrollIntoView: true,
  };
}

/** Removes the block with the blank lines after it, or before it when it is the last block. */
function remove(state: EditorState, block: MarkdownBlock): TransactionSpec {
  const after = state.sliceDoc(block.to);
  const blankAfter = /^\n+/.exec(after)?.[0].length ?? 0;
  const before = state.sliceDoc(0, block.from);
  const blankBefore = blankAfter === 0 ? (/\n+$/.exec(before)?.[0].length ?? 0) : 0;
  const from = block.from - blankBefore;
  return {
    changes: { from, to: block.to + blankAfter },
    selection: EditorSelection.cursor(from),
    userEvent: 'delete.block',
    scrollIntoView: true,
  };
}

function turnInto(state: EditorState, block: MarkdownBlock, kind: TurnIntoKind): TransactionSpec {
  const lines = state.sliceDoc(block.from, block.to).split('\n');
  const plainLines = lines.map((line) => line.replace(LINE_MARKERS, '$1'));
  const insert =
    kind === 'codeBlock'
      ? [FENCE, ...plainLines, FENCE].join('\n')
      : plainLines.map((line) => (line.trim() === '' ? line : LINE_PREFIXES[kind] + line)).join('\n');
  return {
    changes: { from: block.from, to: block.to, insert },
    selection: EditorSelection.cursor(block.from + insert.length),
    userEvent: 'input.format',
  };
}
