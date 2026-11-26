import { readFrontMatterLayout, type FrontMatterEntry } from './frontMatterLayout';

export type EditableProperty =
  | { readonly key: string; readonly kind: 'value'; readonly value: string }
  | { readonly key: string; readonly kind: 'list'; readonly values: readonly string[] };

/**
 * The properties of front matter that `editFrontMatter` can change in place, in file order; undefined
 * when the text has no front matter or it is more than simple values and lists.
 */
export function readEditableFrontMatter(text: string): readonly EditableProperty[] | undefined {
  const layout = readFrontMatterLayout(text);
  if (layout === undefined || layout === 'complex') return undefined;
  return layout.entries.map(editablePropertyOf);
}

function editablePropertyOf({ key, value }: FrontMatterEntry): EditableProperty {
  if (value.kind === 'empty') return { key, kind: 'value', value: '' };
  if (value.kind === 'scalar') return { key, kind: 'value', value: value.scalar.value };
  if (value.kind === 'inlineList')
    return { key, kind: 'list', values: value.items.map((item) => item.value) };
  return { key, kind: 'list', values: value.items.map((item) => item.scalar.value) };
}
