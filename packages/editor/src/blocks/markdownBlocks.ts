import { ensureSyntaxTree, type syntaxTree } from '@codemirror/language';
import type { EditorState, Text } from '@codemirror/state';

// @lezer/common is not a direct dependency, so the node type comes from the tree CodeMirror returns.
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'listItem'
  | 'codeBlock'
  | 'table'
  | 'quote'
  | 'mathBlock'
  | 'htmlBlock'
  | 'horizontalRule';

/** A block of whole lines; `from` is the start of its first line and `to` the end of its last line. */
export interface MarkdownBlock {
  readonly kind: BlockKind;
  readonly from: number;
  readonly to: number;
}

/** How long the parser may work to finish the tree before a lookup gives up. */
const PARSE_TIMEOUT_MS = 200;
const LIST_NODES: ReadonlySet<string> = new Set(['BulletList', 'OrderedList']);
const DISPLAY_MATH_START = /^\s*\$\$/;
const FRONT_MATTER_FENCE = /^---\s*$/;

const KINDS_BY_NODE: Readonly<Record<string, BlockKind>> = {
  Paragraph: 'paragraph',
  ATXHeading1: 'heading',
  ATXHeading2: 'heading',
  ATXHeading3: 'heading',
  ATXHeading4: 'heading',
  ATXHeading5: 'heading',
  ATXHeading6: 'heading',
  SetextHeading1: 'heading',
  SetextHeading2: 'heading',
  ListItem: 'listItem',
  FencedCode: 'codeBlock',
  CodeBlock: 'codeBlock',
  Table: 'table',
  Blockquote: 'quote',
  HTMLBlock: 'htmlBlock',
  CommentBlock: 'htmlBlock',
  HorizontalRule: 'horizontalRule',
};

/**
 * The blocks that sit side by side with the block at a position: the items of its list, or the
 * top-level blocks of the document. Undefined when the tree is not complete yet or the position
 * is in front matter or between blocks.
 */
export function siblingBlocksAt(
  state: EditorState,
  position: number,
): { readonly blocks: readonly MarkdownBlock[]; readonly index: number } | undefined {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
  if (!tree) return undefined;
  const frontMatterEnd = frontMatterEndOf(state.doc);
  if (position < frontMatterEnd) return undefined;
  const listItem =
    innermostListItem(tree.resolveInner(position, 1)) ?? innermostListItem(tree.resolveInner(position, -1));
  const blocks = listItem?.parent
    ? itemBlocksOf(listItem.parent, state.doc)
    : topLevelBlocksOf(tree.topNode, state.doc, frontMatterEnd);
  const index = blocks.findIndex((block) => block.from <= position && position <= block.to);
  return index === -1 ? undefined : { blocks, index };
}

/** The block at a position, or undefined when there is none or the tree is not complete. */
export function blockAt(state: EditorState, position: number): MarkdownBlock | undefined {
  const siblings = siblingBlocksAt(state, position);
  return siblings ? siblings.blocks[siblings.index] : undefined;
}

/** Front matter is a `---` fenced section at the very start; it is never a block. */
export function frontMatterEndOf(doc: Text): number {
  if (doc.lines < 2 || !FRONT_MATTER_FENCE.test(doc.line(1).text)) return 0;
  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (FRONT_MATTER_FENCE.test(line.text)) return line.to;
  }
  return 0;
}

function innermostListItem(node: SyntaxNode | null): SyntaxNode | undefined {
  for (let current = node; current; current = current.parent) {
    if (current.name === 'ListItem') return current;
  }
  return undefined;
}

function itemBlocksOf(list: SyntaxNode, doc: Text): MarkdownBlock[] {
  return childrenOf(list)
    .filter((child) => child.name === 'ListItem')
    .map((item) => ({ kind: 'listItem', ...lineRangeOf(item, doc) }));
}

function topLevelBlocksOf(document: SyntaxNode, doc: Text, frontMatterEnd: number): MarkdownBlock[] {
  return childrenOf(document)
    .filter((child) => child.to > frontMatterEnd)
    .flatMap((child) => {
      const block = blockOfNode(child, doc);
      return block ? [block] : [];
    });
}

function blockOfNode(node: SyntaxNode, doc: Text): MarkdownBlock | undefined {
  const range = lineRangeOf(node, doc);
  if (LIST_NODES.has(node.name)) return { kind: 'list', ...range };
  const kind = Object.hasOwn(KINDS_BY_NODE, node.name) ? KINDS_BY_NODE[node.name] : undefined;
  if (!kind) return undefined;
  const isDisplayMath =
    kind === 'paragraph' && DISPLAY_MATH_START.test(doc.sliceString(range.from, range.to));
  return { kind: isDisplayMath ? 'mathBlock' : kind, ...range };
}

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

function lineRangeOf(node: SyntaxNode, doc: Text): { from: number; to: number } {
  const lastLine = doc.lineAt(
    node.to > node.from && doc.lineAt(node.to).from === node.to ? node.to - 1 : node.to,
  );
  return { from: doc.lineAt(node.from).from, to: lastLine.to };
}
