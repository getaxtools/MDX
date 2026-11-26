import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { measureTextAsEmpty } from '../../formula-paste/pasteTestEvents';
import { openRichTextEditor, placeCaret } from '../../rich-text/richTextTestEditor';
import { tableAt } from '../tableCells';

/** The property opens and types into sixty tables, which takes longer than one test usually may on a busy machine. */
const PROPERTY_TEST_TIMEOUT_MS = 30_000;

const GFM_SHOWCASE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'documents',
  'gfm-showcase.md',
);

// Characters that could start another block at the start of a row, such as `* ` or `1.`, are left out.
const cellText = fc.stringMatching(/^(?:[a-zA-Z0-9 ,é漢]|\\\|)*$/).map((text) => text.trim());
const tableShape = fc.record({
  columns: fc.integer({ min: 1, max: 4 }),
  rows: fc.integer({ min: 1, max: 4 }),
  padding: fc.constantFrom('', ' ', '   '),
  isClosed: fc.boolean(),
});
const TABLE_START = 'Intro\n\n'.length;
const typedText = fc.stringMatching(/^[a-z|\n\\ ]{1,6}$/);

function rowText(cells: readonly string[], padding: string, isClosed: boolean): string {
  const inner = cells.map((cell) => `${padding}${cell}${padding}`).join('|');
  return isClosed ? `|${inner}|` : inner;
}

/** Typing at a place inside one cell, then checking that every byte outside that cell is unchanged. */
interface Typing {
  /** Which cell, counted round the table's cells. */
  readonly cellIndex: number;
  /** Where in the cell's text, from 0 (its start) to 1 (its end). */
  readonly offsetRatio: number;
  readonly text: string;
}

function checkTypingInCell(document: string, { cellIndex, offsetRatio, text }: Typing): void {
  const editor = openRichTextEditor(document);
  try {
    const firstText = TABLE_START + document.slice(TABLE_START).search(/\S/);
    const table = tableAt(editor.view.state, firstText + 1);
    const cell = table?.cells[cellIndex % Math.max(table.cells.length, 1)];
    if (!table || !cell) throw new Error(`No table cell in: ${document}`);
    const position = cell.from + Math.round((cell.to - cell.from) * offsetRatio);
    placeCaret(editor.view, position);
    editor.view.dispatch(editor.view.state.replaceSelection(text), { userEvent: 'input.type' });

    const edited = editor.view.state.doc.toString();
    expect(edited.length).toBeGreaterThan(document.length);
    expect(edited.startsWith(document.slice(0, cell.from))).toBe(true);
    expect(edited.endsWith(document.slice(cell.to))).toBe(true);
  } finally {
    editor.close();
  }
}

let restoreTextMeasuring: () => void;

beforeAll(() => {
  restoreTextMeasuring = measureTextAsEmpty();
});

afterAll(() => {
  restoreTextMeasuring();
});

describe('cell-local edits', () => {
  it('editing one cell changes bytes only inside it', { timeout: PROPERTY_TEST_TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(
        tableShape.chain((shape) =>
          fc.record({
            shape: fc.constant(shape),
            cells: fc.array(fc.array(cellText, { minLength: shape.columns, maxLength: shape.columns }), {
              minLength: shape.rows + 1,
              maxLength: shape.rows + 1,
            }),
          }),
        ),
        fc.record({
          cellIndex: fc.nat(),
          offsetRatio: fc.double({ min: 0, max: 1, noNaN: true }),
          text: typedText,
        }),
        ({ shape, cells }, typing) => {
          const [header = [], ...body] = cells;
          // A table of one column is a table only with its pipes.
          const isClosed = shape.isClosed || shape.columns === 1;
          const delimiter = Array.from({ length: shape.columns }, () => '---');
          const table = [
            rowText(
              header.map((cell) => cell || 'H'),
              shape.padding,
              isClosed,
            ),
            rowText(delimiter, shape.padding, isClosed),
            ...body.map((row) => rowText(row, shape.padding, isClosed)),
          ].join('\n');
          checkTypingInCell(`Intro\n\n${table}\n\nEnd`, typing);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('editing one cell of each table fixture changes bytes only inside it', () => {
    const showcase = readFileSync(GFM_SHOWCASE, 'utf8');
    const tables = showcase.split(/\n\s*\n/).filter((block) => /^\|.*\|\s*\n\|[\s:|-]+\|/.test(block.trim()));

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      for (let cellIndex = 0; cellIndex < 6; cellIndex += 1) {
        checkTypingInCell(`Intro\n\n${table.trim()}\n\nEnd`, { cellIndex, offsetRatio: 1, text: 'a|b\nc' });
      }
    }
  });
});
