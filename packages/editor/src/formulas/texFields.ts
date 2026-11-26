import type { ExpandedSnippetText } from '../snippets/snippetFields';

/** A placeholder in a TeX template: `#{}` when empty, `#{b}` with the text it starts with. */
const PLACEHOLDER = /#\{([^{}]*)\}/g;

/** TeX with placeholders as snippet text, whose fields Tab visits in the order they are written. */
export function texWithFields(template: string): ExpandedSnippetText {
  let text = '';
  let copiedTo = 0;
  const fields: { from: number; to: number }[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    text += template.slice(copiedTo, match.index);
    const from = text.length;
    text += match[1] ?? '';
    fields.push({ from, to: text.length });
    copiedTo = match.index + match[0].length;
  }
  return { text: text + template.slice(copiedTo), fields };
}
