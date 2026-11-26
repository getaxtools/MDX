/** A tag in the tag view; `work/finance` is the child `finance` of `work`. */
export interface TagNode {
  /** The last part of the tag, as shown. */
  readonly name: string;
  /** The whole tag, as searched for. */
  readonly tag: string;
  /** Notes carrying exactly this tag; a parent that is never used alone has none. */
  readonly notes: number;
  readonly children: readonly TagNode[];
}

interface Building {
  readonly name: string;
  readonly tag: string;
  notes: number;
  readonly children: Map<string, Building>;
}

/** Nests the tags by their `/` parts, each level in the order the Explorer uses. */
export function tagTree(
  counts: readonly { readonly tag: string; readonly notes: number }[],
  locale: string,
): TagNode[] {
  const root = new Map<string, Building>();
  for (const { tag, notes } of counts) {
    const parts = tag.split('/').filter((part) => part !== '');
    let level = root;
    parts.forEach((name, index) => {
      const key = name.toLowerCase();
      const node = level.get(key) ?? {
        name,
        tag: parts.slice(0, index + 1).join('/'),
        notes: 0,
        children: new Map<string, Building>(),
      };
      if (index === parts.length - 1) node.notes += notes;
      level.set(key, node);
      level = node.children;
    });
  }
  return finished(root, new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }));
}

function finished(level: Map<string, Building>, order: Intl.Collator): TagNode[] {
  return [...level.values()]
    .sort((first, second) => order.compare(first.name, second.name))
    .map(({ name, tag, notes, children }) => ({ name, tag, notes, children: finished(children, order) }));
}
