import type { syntaxTree } from '@codemirror/language';
import {
  DiagramWidget,
  FormulaWidget,
  HtmlBlockWidget,
  PropertiesChipWidget,
  TableWidget,
} from './blockWidgets';
import { lineCountOf } from './renderedWidgets';
import type { RichTextBlock, RichTextBlockProvider } from './richTextProviders';
import { richTextRenderingFacet } from './richTextRendering';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

/** The preview's limits: larger tables and longer lines and formulas stay Markdown text. */
export const MAX_RENDERED_TABLE_CELLS = 2_000;
export const MAX_RENDERED_LINE_LENGTH = 10_000;
export const MAX_RENDERED_FORMULA_LENGTH = 10_000;

/** A front matter line that names a property: a YAML `key:` or a TOML `key =` at the start of the line. */
const PROPERTY_LINE = /^[^\s#-][^:=]*(?::|\s*=)/;

function hasRendering(block: RichTextBlock): boolean {
  return block.state.facet(richTextRenderingFacet) !== undefined;
}

function hasOverlongLine(source: string): boolean {
  return source.split('\n').some((line) => line.length > MAX_RENDERED_LINE_LENGTH);
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

const tables: RichTextBlockProvider = {
  nodeNames: ['Table'],
  widgetFor: (block) => {
    if (!hasRendering(block) || hasOverlongLine(block.source)) return undefined;
    const size = tableSizeOf(block.node);
    if (size.cells > MAX_RENDERED_TABLE_CELLS) return undefined;
    return new TableWidget(block.source, size);
  },
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
];
