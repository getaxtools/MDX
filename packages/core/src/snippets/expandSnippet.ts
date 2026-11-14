import { formatDate } from '../dates/formatDate';

/** Where a numbered field ended up in the expanded text. */
export interface SnippetField {
  readonly number: number;
  readonly from: number;
  readonly to: number;
}

export interface ExpandedSnippet {
  readonly text: string;
  /** In field order: 1, 2, 3 ... */
  readonly fields: readonly SnippetField[];
}

export interface SnippetContext {
  readonly now: Date;
  readonly locale: string;
  /** The document's title, such as its file name without the extension. */
  readonly title: string;
  readonly selection: string;
}

/** `{{1:placeholder}}` marks field 1; `{{date}}` and friends are variables; anything else is text. */
const FIELD_OR_VARIABLE = /\{\{(?:(\d{1,2}):((?:[^{}]|\{\{[^{}]*\}\})*)|([a-z]+)(?::([^{}]*))?)\}\}/g;

/**
 * Fills variables and marks fields; every other character of the body is kept exactly, so dollar
 * signs in math and trailing spaces stay as they are, and unknown variables stay as typed.
 */
export function expandSnippet(body: string, context: SnippetContext): ExpandedSnippet {
  const fields: SnippetField[] = [];
  let text = '';
  let lastIndex = 0;
  for (const match of body.matchAll(FIELD_OR_VARIABLE)) {
    text += body.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    const [whole, fieldNumber, placeholder = '', variable, format] = match;
    if (fieldNumber !== undefined) {
      const filled = expandVariablesOnly(placeholder, context);
      fields.push({ number: Number(fieldNumber), from: text.length, to: text.length + filled.length });
      text += filled;
    } else {
      text += variableValue(variable ?? '', format, context) ?? whole;
    }
  }
  text += body.slice(lastIndex);
  return { text, fields: fields.sort((first, second) => first.number - second.number) };
}

function expandVariablesOnly(text: string, context: SnippetContext): string {
  return text.replace(FIELD_OR_VARIABLE, (whole: string, ...groups: (string | undefined)[]) => {
    const [fieldNumber, , variable, format] = groups;
    return fieldNumber === undefined ? (variableValue(variable ?? '', format, context) ?? whole) : whole;
  });
}

function variableValue(
  name: string,
  format: string | undefined,
  context: SnippetContext,
): string | undefined {
  if (name === 'title') return context.title;
  if (name === 'selection') return context.selection;
  if (name === 'date' || name === 'time') {
    if (format) return formatDate(context.now, format, context.locale);
    const style = name === 'date' ? { dateStyle: 'short' as const } : { timeStyle: 'short' as const };
    return new Intl.DateTimeFormat(context.locale, style).format(context.now);
  }
  return undefined;
}

/** Fills a note template: the title, date and time variables; unknown variables stay as typed. */
export function expandTemplate(body: string, context: Omit<SnippetContext, 'selection'>): string {
  return expandSnippet(body, { ...context, selection: '' }).text;
}
