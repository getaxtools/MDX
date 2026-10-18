export interface MarkdownTableOptions {
  /** Uses the first row as the header; otherwise columns are named by `columnName`. */
  readonly hasHeaderRow: boolean;
  readonly columnName: (columnNumber: number) => string;
}

type Alignment = 'left' | 'right';

const MIN_COLUMN_WIDTH = 3;
const NUMBER = /^[-+(]?\p{Sc}?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?\)?%?$/u;
const graphemes = new Intl.Segmenter();

/** A GitHub-flavoured Markdown table with padded columns; numeric columns are right-aligned. */
export function toMarkdownTable(rows: readonly (readonly string[])[], options: MarkdownTableOptions): string {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (columnCount === 0) return '';
  const cells = rows.map((row) => Array.from({ length: columnCount }, (_, index) => toCellText(row[index])));
  const header = options.hasHeaderRow
    ? (cells[0] ?? [])
    : Array.from({ length: columnCount }, (_, index) => options.columnName(index + 1));
  const body = options.hasHeaderRow ? cells.slice(1) : cells;
  const alignments = header.map((_, column) => alignmentOf(body.map((row) => row[column] ?? '')));
  const widths = header.map((_, column) =>
    Math.max(MIN_COLUMN_WIDTH, ...[header, ...body].map((row) => visibleLength(row[column] ?? ''))),
  );
  return [
    formatRow(header, widths, alignments),
    formatSeparator(widths, alignments),
    ...body.map((row) => formatRow(row, widths, alignments)),
  ].join('\n');
}

function toCellText(value: string | undefined): string {
  return (value ?? '').trim().replaceAll('|', '\\|').replace(/\n/g, '<br>');
}

function alignmentOf(columnCells: readonly string[]): Alignment {
  const filledCells = columnCells.filter((cell) => cell !== '');
  return filledCells.length > 0 && filledCells.every((cell) => NUMBER.test(cell)) ? 'right' : 'left';
}

function visibleLength(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}

function pad(text: string, width: number, alignment: Alignment): string {
  const padding = ' '.repeat(width - visibleLength(text));
  return alignment === 'right' ? padding + text : text + padding;
}

function formatRow(
  row: readonly string[],
  widths: readonly number[],
  alignments: readonly Alignment[],
): string {
  const padded = widths.map((width, column) => pad(row[column] ?? '', width, alignments[column] ?? 'left'));
  return `| ${padded.join(' | ')} |`;
}

function formatSeparator(widths: readonly number[], alignments: readonly Alignment[]): string {
  const dashes = widths.map((width, column) =>
    alignments[column] === 'right' ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width),
  );
  return `| ${dashes.join(' | ')} |`;
}
