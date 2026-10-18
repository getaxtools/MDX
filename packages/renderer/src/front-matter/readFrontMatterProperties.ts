export interface DocumentProperty {
  readonly name: string;
  readonly values: readonly string[];
}

interface CollectedProperty {
  readonly name: string;
  readonly values: string[];
}

const PROPERTY_LINE = /^([A-Za-z_][\w.-]*)\s*:\s*(.*)$/;
const LIST_ITEM_LINE = /^\s+-\s+(.*)$/;
const INLINE_LIST = /^\[(.*)\]$/;

/**
 * Reads simple `name: value` front matter, including `[a, b]` and indented `- item` lists.
 * Returns undefined for anything more complex, so the caller can show the raw text instead.
 */
export function readFrontMatterProperties(frontMatter: string): DocumentProperty[] | undefined {
  const properties: CollectedProperty[] = [];
  let listProperty: CollectedProperty | undefined;
  for (const line of frontMatter.split(/\r?\n/).filter(isMeaningfulLine)) {
    const listItem = LIST_ITEM_LINE.exec(line);
    if (listItem) {
      if (!listProperty) return undefined;
      listProperty.values.push(unquoted(listItem[1] ?? ''));
      continue;
    }
    const property = propertyOf(line);
    if (!property) return undefined;
    properties.push(property);
    listProperty = property.values.length === 0 ? property : undefined;
  }
  return properties;
}

function isMeaningfulLine(line: string): boolean {
  return line.trim() !== '' && !line.trimStart().startsWith('#');
}

function propertyOf(line: string): CollectedProperty | undefined {
  const match = PROPERTY_LINE.exec(line);
  return match ? { name: match[1] ?? '', values: valuesOf(match[2] ?? '') } : undefined;
}

function valuesOf(rawValue: string): string[] {
  const value = rawValue.trim();
  if (value === '') return [];
  const inlineList = INLINE_LIST.exec(value);
  if (!inlineList) return [unquoted(value)];
  return (inlineList[1] ?? '')
    .split(',')
    .map((item) => unquoted(item.trim()))
    .filter((item) => item !== '');
}

function unquoted(value: string): string {
  const isQuoted =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  return isQuoted ? value.slice(1, -1) : value;
}
