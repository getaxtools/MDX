import { describe, expect, it } from 'vitest';
import { parseSpreadsheetCells } from './parseSpreadsheetCells';

describe('parseSpreadsheetCells', () => {
  it('reads rows and tab-separated cells as Excel copies them, with Windows line endings', () => {
    expect(parseSpreadsheetCells('Name\tQty\r\nApple\t3\r\n')).toEqual([
      ['Name', 'Qty'],
      ['Apple', '3'],
    ]);
  });

  it('reads rows separated by plain line feeds, as other spreadsheets copy them', () => {
    expect(parseSpreadsheetCells('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps line breaks, tabs and doubled quotes inside quoted cells', () => {
    expect(parseSpreadsheetCells('"two\r\nlines"\t"say ""hi"""\t"a\tb"\r\n')).toEqual([
      ['two\nlines', 'say "hi"', 'a\tb'],
    ]);
  });

  it('treats a quote in the middle of a cell as text', () => {
    expect(parseSpreadsheetCells('5" screen\t12')).toEqual([['5" screen', '12']]);
  });

  it('keeps empty cells and empty rows inside the selection', () => {
    expect(parseSpreadsheetCells('a\t\tc\r\n\t\t\r\nd\te\tf\r\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
      ['d', 'e', 'f'],
    ]);
  });

  it('drops empty rows at the end', () => {
    expect(parseSpreadsheetCells('a\tb\r\n\t\r\n\r\n')).toEqual([['a', 'b']]);
  });

  it('reads nothing from empty text', () => {
    expect(parseSpreadsheetCells('')).toEqual([]);
    expect(parseSpreadsheetCells('\r\n')).toEqual([]);
  });
});
