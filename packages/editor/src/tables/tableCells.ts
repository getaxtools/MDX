import { ensureSyntaxTree, type syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

// @lezer/common is not a direct dependency, so the node type comes from the tree CodeMirror returns.
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

export interface TableCell {
  readonly row: number;
  readonly column: number;
  /** The cell's text without its padding; an empty cell is the place where its text would go. */
  readonly from: number;
  readonly to: number;
}

export interface TableRow {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly isHeader: boolean;
  /** Cells a short row lacks compared with the header; they are added only when the row is edited. */
  readonly missingCells: number;
}

export interface MarkdownTable {
  readonly from: number;
  readonly to: number;
  readonly columnCount: number;
  readonly rows: readonly TableRow[];
  /** Header cells first, then each body row's cells, in reading order; the delimiter row has none. */
  readonly cells: readonly TableCell[];
}

const PARSE_TIMEOUT_MS = 200;

/** The table at a position, or undefined outside tables or when the syntax tree is not complete. */
export function tableAt(state: EditorState, position: number): MarkdownTable | undefined {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
  if (!tree) return undefined;
  const table =
    enclosingTable(tree.resolveInner(position, -1)) ?? enclosingTable(tree.resolveInner(position, 1));
  return table ? tableOf(state, table) : undefined;
}

function enclosingTable(start: SyntaxNode): SyntaxNode | undefined {
  for (let node: SyntaxNode | null = start; node; node = node.parent) {
    if (node.name === 'Table') return node;
  }
  return undefined;
}

function tableOf(state: EditorState, table: SyntaxNode): MarkdownTable {
  const rowNodes = childrenOf(table).filter(
    (child) => child.name === 'TableHeader' || child.name === 'TableRow',
  );
  const cellsByRow = rowNodes.map((row, index) => cellsOfRow(state, row, index));
  const columnCount = cellsByRow[0]?.length ?? 0;
  const rows = rowNodes.map((row, index) => ({
    index,
    from: row.from,
    to: row.to,
    isHeader: row.name === 'TableHeader',
    missingCells: Math.max(columnCount - (cellsByRow[index]?.length ?? 0), 0),
  }));
  return { from: table.from, to: table.to, columnCount, rows, cells: cellsByRow.flat() };
}

/** Cells lie between pipes; an escaped pipe is part of the cell text, so only delimiter nodes split. */
function cellsOfRow(state: EditorState, row: SyntaxNode, rowIndex: number): TableCell[] {
  const pipes = childrenOf(row).filter((child) => child.name === 'TableDelimiter');
  const boundaries = [row.from, ...pipes.flatMap((pipe) => [pipe.from, pipe.to]), row.to];
  const segments: { from: number; to: number }[] = [];
  for (let index = 0; index < boundaries.length; index += 2) {
    const from = boundaries[index] ?? row.from;
    const to = boundaries[index + 1] ?? row.to;
    segments.push({ from, to });
  }
  const isFirstCellAfterPipe = pipes[0]?.from === row.from;
  const isLastCellBeforePipe = pipes.at(-1)?.to === row.to;
  const cellSegments = segments.slice(isFirstCellAfterPipe ? 1 : 0, isLastCellBeforePipe ? -1 : undefined);
  return cellSegments.map((segment, column) => ({ row: rowIndex, column, ...innerRange(state, segment) }));
}

function innerRange(
  state: EditorState,
  { from, to }: { from: number; to: number },
): { from: number; to: number } {
  const text = state.sliceDoc(from, to);
  const leading = text.length - text.trimStart().length;
  const content = text.trim();
  if (content === '') {
    const middle = from + Math.min(1, text.length);
    return { from: middle, to: middle };
  }
  return { from: from + leading, to: from + leading + content.length };
}

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}
