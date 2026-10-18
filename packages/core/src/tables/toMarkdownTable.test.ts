import { describe, expect, it } from 'vitest';
import { toMarkdownTable } from './toMarkdownTable';

const withHeader = {
  hasHeaderRow: true,
  columnName: (columnNumber: number) => `Column ${String(columnNumber)}`,
};
const withoutHeader = { ...withHeader, hasHeaderRow: false };

describe('toMarkdownTable', () => {
  it('uses the first row as the header and pads the columns', () => {
    const table = toMarkdownTable(
      [
        ['Fruit', 'Colour'],
        ['Apple', 'Red'],
        ['Kiwi', 'Green'],
      ],
      withHeader,
    );

    expect(table).toBe(
      ['| Fruit | Colour |', '| ----- | ------ |', '| Apple | Red    |', '| Kiwi  | Green  |'].join('\n'),
    );
  });

  it('right-aligns columns that hold only numbers, amounts and percentages', () => {
    const table = toMarkdownTable(
      [
        ['Item', 'Price', 'Share'],
        ['Tea', '$1,250.50', '12%'],
        ['Cake', '-3', ''],
      ],
      withHeader,
    );

    expect(table.split('\n')).toEqual([
      '| Item |     Price | Share |',
      '| ---- | --------: | ----: |',
      '| Tea  | $1,250.50 |   12% |',
      '| Cake |        -3 |       |',
    ]);
  });

  it('names the columns when the first row is data', () => {
    const table = toMarkdownTable([['Apple', '3']], withoutHeader);

    expect(table.split('\n')).toEqual([
      '| Column 1 | Column 2 |',
      '| -------- | -------: |',
      '| Apple    |        3 |',
    ]);
  });

  it('escapes pipes and turns line breaks inside a cell into <br>', () => {
    const table = toMarkdownTable([['Rule'], ['a | b'], ['first\nsecond']], withHeader);

    expect(table.split('\n').slice(2)).toEqual(['| a \\| b          |', '| first<br>second |']);
  });

  it('fills short rows with empty cells so every row has the same columns', () => {
    const table = toMarkdownTable([['a', 'b', 'c'], ['d']], withHeader);

    expect(table.split('\n')[2]).toBe('| d   |     |     |');
  });

  it('pads by visible characters, so accented and non-Latin text lines up', () => {
    const table = toMarkdownTable([['Name'], ['Zoë'], ['తెలుగు']], withHeader);

    expect(table.split('\n').slice(2)).toEqual(['| Zoë  |', '| తెలుగు  |']);
  });

  it('makes no table from no cells', () => {
    expect(toMarkdownTable([], withHeader)).toBe('');
  });
});
