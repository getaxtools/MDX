/** The preview's limits: larger tables and longer lines and formulas stay Markdown text. */
export const MAX_RENDERED_TABLE_CELLS = 2_000;
export const MAX_RENDERED_LINE_LENGTH = 10_000;
export const MAX_RENDERED_FORMULA_LENGTH = 10_000;

export function hasOverlongLine(source: string): boolean {
  return source.split('\n').some((line) => line.length > MAX_RENDERED_LINE_LENGTH);
}
