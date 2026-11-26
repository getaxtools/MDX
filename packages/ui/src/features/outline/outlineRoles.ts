import type { OutlineEntry } from '@mdx/renderer';

export function hasRoles(outline: readonly OutlineEntry[]): boolean {
  return outline.some((entry) => entry.role !== undefined);
}

/** The entries the outline lists: every heading, or only the requirements of a spec. */
export function shownOutlineEntries(
  outline: readonly OutlineEntry[],
  isRequirementsOnly: boolean,
): readonly OutlineEntry[] {
  return isRequirementsOnly ? outline.filter((entry) => entry.role === 'requirement') : outline;
}

/** The listed heading to mark as current; inside a hidden scenario, that is its requirement. */
export function markedHeadingId(
  outline: readonly OutlineEntry[],
  currentHeadingId: string | undefined,
  isRequirementsOnly: boolean,
): string | undefined {
  if (!isRequirementsOnly || currentHeadingId === undefined) return currentHeadingId;
  const currentIndex = outline.findIndex((entry) => entry.id === currentHeadingId);
  return outline
    .slice(0, currentIndex + 1)
    .filter((entry) => entry.role === 'requirement')
    .at(-1)?.id;
}
