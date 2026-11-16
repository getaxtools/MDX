import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Range, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { BUILT_IN_BLOCK_PROVIDERS } from './builtInBlockProviders';
import { isTouchedBySelection } from './revealRule';
import {
  richTextProvidersFacet,
  withoutFailures,
  type RichTextBlock,
  type RichTextBlockProvider,
} from './richTextProviders';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

interface Span {
  readonly from: number;
  readonly to: number;
}

interface BlockLayerState {
  readonly decorations: DecorationSet;
  /** How far the syntax tree reached when the layer last looked, so newly parsed blocks get widgets. */
  readonly parsedTo: number;
  /** What changed while an input method composed, decorated once the composition is over. */
  readonly heldBack: Span | undefined;
}

/** Nodes that hold blocks; every other block node is looked at as a whole and never entered. */
const BLOCK_CONTAINERS = new Set(['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem']);
const COLLAPSED_LINE = Decoration.replace({});
/** Content indented this far is a code block, so a block indented less may still be rendered. */
const CODE_INDENT = 4;

function blockProvidersOf(state: EditorState): readonly RichTextBlockProvider[] {
  return [...state.facet(richTextProvidersFacet).blocks, ...BUILT_IN_BLOCK_PROVIDERS];
}

/** A block renders only when nothing but a little indentation comes before it on each of its lines. */
function isRenderableAt(state: EditorState, node: SyntaxNode): boolean {
  const firstLine = state.doc.lineAt(node.from);
  const indent = state.sliceDoc(firstLine.from, node.from);
  return indent.trim() === '' && indent.length < CODE_INDENT;
}

function blockOf(state: EditorState, node: SyntaxNode): RichTextBlock {
  const { doc } = state;
  const lastLine = doc.lineAt(node.to);
  const hasEndingLineBreak = lastLine.from === node.to && node.to > node.from;
  const from = doc.lineAt(node.from).from;
  const to = hasEndingLineBreak ? node.to - 1 : lastLine.to;
  return { state, name: node.name, node, from, to, source: state.sliceDoc(from, to) };
}

function blockDecorations(block: RichTextBlock): readonly Range<Decoration>[] {
  const isRevealed = isTouchedBySelection(block.state.selection, block.from, block.to);
  for (const provider of blockProvidersOf(block.state)) {
    if (!provider.nodeNames.includes(block.name)) continue;
    if (isRevealed) return withoutFailures(() => provider.decorationsWhileRevealed?.(block) ?? [], []);
    const widget = withoutFailures(() => provider.widgetFor(block), undefined);
    if (widget) return [Decoration.replace({ widget, block: true }).range(block.from, block.to)];
  }
  return [];
}

/** A heading underlined with `===` or `---` shows on one line while no selection touches it. */
function collapsedUnderline(state: EditorState, heading: SyntaxNode): readonly Range<Decoration>[] {
  const underline = heading.getChild('HeaderMark');
  if (!underline || isTouchedBySelection(state.selection, heading.from, heading.to)) return [];
  const textLineEnd = state.doc.lineAt(underline.from).from - 1;
  return textLineEnd > heading.from ? [COLLAPSED_LINE.range(textLineEnd, underline.to)] : [];
}

function decorationsOfNode(state: EditorState, node: SyntaxNode): readonly Range<Decoration>[] {
  if (!isRenderableAt(state, node)) return [];
  if (node.name.startsWith('SetextHeading')) return collapsedUnderline(state, node);
  return blockDecorations(blockOf(state, node));
}

/** The decorations of the blocks that start in a span. */
function scanBlocks(state: EditorState, span: Span): Range<Decoration>[] {
  const found: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    from: span.from,
    to: span.to,
    enter: (node) => {
      if (BLOCK_CONTAINERS.has(node.name)) return undefined;
      if (node.from >= span.from && node.from <= span.to) found.push(...decorationsOfNode(state, node.node));
      return false;
    },
  });
  return found;
}

function topLevelBlockAt(state: EditorState, position: number): SyntaxNode | undefined {
  let node: SyntaxNode = syntaxTree(state).resolve(position, 1);
  while (node.parent && node.parent.name !== 'Document') node = node.parent;
  return node.name === 'Document' ? undefined : node;
}

/** Widens a span to the whole top-level blocks and existing widgets it touches. */
function widenedSpan(state: EditorState, decorations: DecorationSet, span: Span): Span {
  const { doc } = state;
  let from = Math.min(topLevelBlockAt(state, span.from)?.from ?? span.from, doc.lineAt(span.from).from);
  let to = Math.max(topLevelBlockAt(state, span.to)?.to ?? span.to, doc.lineAt(span.to).to);
  decorations.between(from, to, (decorationFrom, decorationTo) => {
    from = Math.min(from, decorationFrom);
    to = Math.max(to, decorationTo);
  });
  return { from, to: Math.min(to, doc.length) };
}

function rescanned(state: EditorState, decorations: DecorationSet, spans: readonly Span[]): DecorationSet {
  let result = decorations;
  for (const span of spans) {
    const widened = widenedSpan(state, result, span);
    result = result.update({
      filterFrom: widened.from,
      filterTo: widened.to,
      filter: (from) => from < widened.from || from > widened.to,
      add: scanBlocks(state, widened),
      sort: true,
    });
  }
  return result;
}

/** Where a transaction may have changed which blocks show as widgets. */
function changedSpans(layer: BlockLayerState, transaction: Transaction, parsedTo: number): Span[] {
  const spans: Span[] = [];
  transaction.changes.iterChangedRanges((...[, , from, to]: number[]) => {
    if (from !== undefined && to !== undefined) spans.push({ from, to });
  });
  if (transaction.selection || transaction.docChanged) {
    for (const range of transaction.startState.selection.map(transaction.changes).ranges) spans.push(range);
    for (const range of transaction.state.selection.ranges) spans.push(range);
  }
  const treeLength = syntaxTree(transaction.state).length;
  if (treeLength > parsedTo) spans.push({ from: parsedTo, to: treeLength });
  if (layer.heldBack) spans.push(layer.heldBack);
  return spans;
}

function unionOf(spans: readonly Span[]): Span | undefined {
  if (spans.length === 0) return undefined;
  return {
    from: Math.min(...spans.map((span) => span.from)),
    to: Math.max(...spans.map((span) => span.to)),
  };
}

function isComposition(transaction: Transaction): boolean {
  return transaction.isUserEvent('input.type.compose');
}

function updatedBlockLayer(layer: BlockLayerState, transaction: Transaction): BlockLayerState {
  const decorations = layer.decorations.map(transaction.changes);
  const parsedTo = Math.min(transaction.changes.mapPos(layer.parsedTo), transaction.state.doc.length);
  const heldBack = layer.heldBack && {
    from: transaction.changes.mapPos(layer.heldBack.from, -1),
    to: transaction.changes.mapPos(layer.heldBack.to, 1),
  };
  const spans = changedSpans({ ...layer, heldBack }, transaction, parsedTo);
  if (isComposition(transaction)) return { decorations, parsedTo, heldBack: unionOf(spans) };
  const treeLength = syntaxTree(transaction.state).length;
  const due = transaction.reconfigured ? [{ from: 0, to: transaction.state.doc.length }] : spans;
  return {
    decorations: rescanned(transaction.state, decorations, due),
    parsedTo: treeLength,
    heldBack: undefined,
  };
}

/**
 * Rich text's block layer: tables, formulas, HTML blocks, front matter and provider widgets. Only
 * decorations given directly by a state field may replace whole lines, so this is one; it rescans
 * just the blocks a change, a selection or the parser reached, and CodeMirror draws only the widgets in view.
 */
export const blockLayer = StateField.define<BlockLayerState>({
  create: (state) => ({
    decorations: Decoration.set(scanBlocks(state, { from: 0, to: state.doc.length }), true),
    parsedTo: syntaxTree(state).length,
    heldBack: undefined,
  }),
  update: updatedBlockLayer,
  provide: (field) => EditorView.decorations.from(field, (layer) => layer.decorations),
});
