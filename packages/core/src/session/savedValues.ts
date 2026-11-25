import type { DocumentLocation } from '@mdx/platform';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The fields of a saved object that this version does not know, kept so a save can write them back. */
export function unknownFieldsOf(
  saved: unknown,
  knownFields: ReadonlySet<string>,
): Readonly<Record<string, unknown>> {
  if (!isRecord(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter(([field]) => !knownFields.has(field)));
}

/** The entries of a saved array that parse; anything else is dropped rather than failing the whole read. */
export function validEntries<Entry>(
  saved: unknown,
  parse: (value: Record<string, unknown>) => Entry | undefined,
): Entry[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((value: unknown) => {
    const entry = isRecord(value) ? parse(value) : undefined;
    return entry === undefined ? [] : [entry];
  });
}

export function parseLocation(value: unknown): DocumentLocation | undefined {
  if (!isRecord(value)) return undefined;
  const { canonicalKey, displayPath, fileName } = value;
  if (typeof canonicalKey !== 'string' || typeof displayPath !== 'string' || typeof fileName !== 'string') {
    return undefined;
  }
  return { canonicalKey, displayPath, fileName };
}
