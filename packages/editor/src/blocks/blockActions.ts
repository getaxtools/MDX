import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { blockMove } from './moveBlocks';
import { siblingBlocksAt, type MarkdownBlock } from './markdownBlocks';
import { calloutStartChange } from '../rich-text/calloutFolds';
import { calloutLineAt, type CalloutFoldSign } from '../rich-text/calloutMarker';
import { tableAsTextAtCaret } from '../tables/grid/tablesAsText';
import type { TurnIntoKind } from '../plain/turnIntoKinds';

export { TURN_INTO_KINDS, type TurnIntoKind } from '../plain/turnIntoKinds';

export type BlockAction =
  | 'moveUp'
  | 'moveDown'
  | 'duplicate'
  | 'delete'
  | 'startCollapsed'
  | 'startExpanded'
  | 'editTableAsText'
  | `turnInto.${TurnIntoKind}`;

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
  if (action === 'editTableAsText') return tableAsTextAtCaret(state);
  const block = blockAtCaret(state);
  if (!block) return undefined;
  if (isBlockEdit(action)) return BLOCK_EDITS[action](state, block);
  return turnInto(state, block, action.slice('turnInto.'.length) as TurnIntoKind);
}

type BlockEdit = 'duplicate' | 'delete' | 'startCollapsed' | 'startExpanded';

const BLOCK_EDITS: Readonly<
  Record<BlockEdit, (state: EditorState, block: MarkdownBlock) => TransactionSpec | undefined>
> = {
  duplicate: (state, block) => duplicate(state, block),
  delete: (state, block) => remove(state, block),
  startCollapsed: (state, block) => calloutStart(state, block, 'startCollapsed'),
  startExpanded: (state, block) => calloutStart(state, block, 'startExpanded'),
};

function isBlockEdit(action: BlockAction): action is BlockEdit {
  return Object.hasOwn(BLOCK_EDITS, action);
}

/** The fold sign of the callout at the caret, or undefined when the block is not a callout. */
export function calloutFoldAtCaret(state: EditorState): CalloutFoldSign | undefined {
  const block = blockAtCaret(state);
  return block?.kind === 'quote' ? calloutLineAt(state, block.from)?.foldSign : undefined;
}

function calloutStart(
  state: EditorState,
  block: MarkdownBlock,
  action: 'startCollapsed' | 'startExpanded',
): TransactionSpec | undefined {
  const callout = block.kind === 'quote' ? calloutLineAt(state, block.from) : undefined;
  return callout
    ? calloutStartChange(callout, action === 'startCollapsed' ? 'collapsed' : 'expanded')
    : undefined;
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
