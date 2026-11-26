import type { EditableProperty, FrontMatterEdit } from '@mdx/core';

const LIST_SEPARATOR = ',';

/** The text a field shows: the value, or a list's items separated by commas. */
export function propertyFieldText(property: EditableProperty): string {
  return property.kind === 'value' ? property.value : property.values.join(`${LIST_SEPARATOR} `);
}

/** A list item holding a comma could not be told apart from two items, so such a list is not a field. */
export function canEditInField(property: EditableProperty): boolean {
  return property.kind === 'value' || property.values.every((value) => !value.includes(LIST_SEPARATOR));
}

/** The edit that typed text asks for; undefined when nothing changed. */
export function propertyFieldEdit(
  property: EditableProperty,
  typedText: string,
): FrontMatterEdit | undefined {
  if (typedText === propertyFieldText(property)) return undefined;
  if (property.kind === 'value') {
    const value = typedText.trim();
    return value === property.value ? undefined : { kind: 'setValue', key: property.key, value };
  }
  const values = listValuesOf(property.values, typedText);
  const isUnchanged =
    values.length === property.values.length &&
    values.every((value, index) => value === property.values[index]);
  return isUnchanged ? undefined : { kind: 'setList', key: property.key, values };
}

/** An item whose text is as the field showed it keeps its exact value; a changed one loses surrounding spaces. */
function listValuesOf(savedValues: readonly string[], typedText: string): string[] {
  const shownItems = savedValues.map((value, index) => (index === 0 ? value : ` ${value}`));
  return typedText.split(LIST_SEPARATOR).flatMap((item, index) => {
    const savedValue = savedValues[index];
    if (savedValue !== undefined && item === shownItems[index]) return [savedValue];
    const value = item.trim();
    return value === '' ? [] : [value];
  });
}
