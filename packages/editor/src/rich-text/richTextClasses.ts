/** On the editor while it shows Rich text. */
export const RICH_TEXT_CLASS = 'cm-rich-text';
export const LINK_TEXT_CLASS = 'cm-rich-link';
export const INLINE_CODE_CLASS = 'cm-rich-inline-code';
export const CODE_LINE_CLASS = 'cm-rich-code-line';
export const HEADING_CLASS = 'cm-rich-heading';
export const QUOTE_CLASS = 'cm-rich-quote';
export const BULLET_CLASS = 'cm-rich-bullet';
export const LIST_NUMBER_CLASS = 'cm-rich-list-number';
export const TASK_CHECKBOX_CLASS = 'cm-rich-task';

/** Quotes nested deeper than this are indented like this depth. */
export const DEEPEST_QUOTE_STYLE = 3;
export const DEEPEST_HEADING_LEVEL = 6;
export const HEADING_LEVELS: readonly number[] = Array.from(
  { length: DEEPEST_HEADING_LEVEL },
  (_, index) => index + 1,
);

export function headingClassOf(level: number): string {
  return `${HEADING_CLASS}-${String(level)}`;
}

export function quoteDepthClassOf(depth: number): string {
  return `${QUOTE_CLASS}-${String(Math.min(depth, DEEPEST_QUOTE_STYLE))}`;
}
