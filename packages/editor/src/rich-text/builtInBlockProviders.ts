import {
  DiagramWidget,
  FormulaWidget,
  HtmlBlockWidget,
  PropertiesChipWidget,
  TableWidget,
  TextNoticeWidget,
} from './blockWidgets';
import { EMBED_BLOCKS } from './embeds';
import { lineCountOf } from './renderedWidgets';
import type { RichTextBlock, RichTextBlockProvider } from './richTextProviders';
import { richTextRenderingFacet } from './richTextRendering';
import { hasOverlongLine, MAX_RENDERED_FORMULA_LENGTH, MAX_RENDERED_TABLE_CELLS } from './renderLimits';
import type { SyntaxNode } from '../syntax/syntaxNode';
import { TABLE_GRID } from '../tables/grid/liveCellGrid';
import { Decoration } from '@codemirror/view';
import type { Range } from '@codemirror/state';

/** A front matter line that names a property: a YAML `key:` or a TOML `key =` at the start of the line. */
const PROPERTY_LINE = /^[^\s#-][^:=]*(?::|\s*=)/;

function hasRendering(block: RichTextBlock): boolean {
  return block.state.facet(richTextRenderingFacet) !== undefined;
}

function tableSizeOf(table: SyntaxNode): { rows: number; columns: number; cells: number } {
  const rows = [...table.getChildren('TableHeader'), ...table.getChildren('TableRow')];
  const cellCounts = rows.map((row) => row.getChildren('TableCell').length);
  return {
    rows: rows.length,
    columns: cellCounts[0] ?? 0,
    cells: cellCounts.reduce((sum, count) => sum + count, 0),
  };
}

function isTooLargeForGrid(block: RichTextBlock): boolean {
  return hasOverlongLine(block.source) || tableSizeOf(block.node).cells > MAX_RENDERED_TABLE_CELLS;
}

function tooLargeNotice(block: RichTextBlock): readonly Range<Decoration>[] {
  const rendering = block.state.facet(richTextRenderingFacet);
  if (!rendering || !isTooLargeForGrid(block)) return [];
  const widget = new TextNoticeWidget(rendering.labels.tableTooLarge());
  return [Decoration.widget({ widget, block: true, side: -1 }).range(block.from)];
}

const tables: RichTextBlockProvider = {
  nodeNames: ['Table'],
  widgetFor: (block) =>
    hasRendering(block) && !isTooLargeForGrid(block)
      ? new TableWidget(block.source, tableSizeOf(block.node))
      : undefined,
  decorationsWhileRevealed: (block) =>
    isTooLargeForGrid(block) ? tooLargeNotice(block) : TABLE_GRID.decorationsWhileRevealed(block),
  decorationsWithoutWidget: tooLargeNotice,
};

const displayFormulas: RichTextBlockProvider = {
  nodeNames: ['DisplayMath'],
  widgetFor: (block) => {
    const marks = block.node.getChildren('MathMark');
    const [opening] = marks;
    const closing = marks.at(-1);
    if (!hasRendering(block) || !opening || !closing || opening === closing) return undefined;
    const tex = block.state.sliceDoc(opening.to, closing.from).trim();
    if (tex.length > MAX_RENDERED_FORMULA_LENGTH) return undefined;
    return new FormulaWidget(block.source, tex, true);
  },
};

const htmlBlocks: RichTextBlockProvider = {
  nodeNames: ['HTMLBlock'],
  widgetFor: (block) =>
    hasRendering(block) && !hasOverlongLine(block.source)
      ? new HtmlBlockWidget(block.source, lineCountOf(block.source))
      : undefined,
};

const frontMatter: RichTextBlockProvider = {
  nodeNames: ['FrontMatter'],
  widgetFor: (block) => {
    if (!hasRendering(block)) return undefined;
    const lines = block.source.split('\n').slice(1, -1);
    return new PropertiesChipWidget(block.source, lines.filter((line) => PROPERTY_LINE.test(line)).length);
  },
};

/** A code block is drawn only when the app can draw its language; otherwise it stays a code block. */
const diagrams: RichTextBlockProvider = {
  nodeNames: ['FencedCode'],
  widgetFor: (block) => {
    const rendering = block.state.facet(richTextRenderingFacet);
    const info = block.node.getChild('CodeInfo');
    const code = block.node.getChild('CodeText');
    if (!rendering?.drawDiagram || !info || !code) return undefined;
    const type = block.state.sliceDoc(info.from, info.to).trim().toLowerCase();
    if (rendering.canDrawDiagram?.(type) !== true) return undefined;
    return new DiagramWidget(block.source, { type, code: block.state.sliceDoc(code.from, code.to) });
  },
};

export const BUILT_IN_BLOCK_PROVIDERS: readonly RichTextBlockProvider[] = [
  tables,
  displayFormulas,
  htmlBlocks,
  frontMatter,
  diagrams,
  EMBED_BLOCKS,
];
