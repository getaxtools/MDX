import { linkKindOf, type OutlineEntry } from '@mdx/renderer';
import type { DocumentLink } from '../document-view/DocumentLink';
import { linkedHeadingIds } from '../document-view/findLinkedHeading';

/** Where a link opened from the editor goes: another document, a web address, or a heading of this one. */
export type EditorLinkTarget =
  | { readonly kind: 'document' | 'external'; readonly link: DocumentLink }
  | { readonly kind: 'heading'; readonly fragment: string };

/** Classifies an address with the preview's own rules, so the editor opens exactly what the preview would. */
export function editorLinkTarget(address: string): EditorLinkTarget | undefined {
  const kind = linkKindOf(address);
  if (kind === 'anchor') return { kind: 'heading', fragment: address.slice(1) };
  if (kind === undefined) return undefined;
  return { kind, link: { kind, href: address } };
}

export interface EditorLinkActions {
  readonly openLink: (link: DocumentLink) => void;
  readonly goToHeading: (entry: OutlineEntry) => void;
}

/** Opens a link from the editor where the preview's link goes: a document, the browser after asking, or a heading. */
export function openLinkFromEditor(
  address: string,
  outline: readonly OutlineEntry[],
  actions: EditorLinkActions,
): void {
  const target = editorLinkTarget(address);
  if (target?.kind !== 'heading') {
    if (target) actions.openLink(target.link);
    return;
  }
  const entry = linkedOutlineEntry(outline, target.fragment);
  if (entry) actions.goToHeading(entry);
}

/** The outline entry of the heading an in-document link points to. */
export function linkedOutlineEntry(
  outline: readonly OutlineEntry[],
  fragment: string,
): OutlineEntry | undefined {
  for (const id of linkedHeadingIds(fragment)) {
    const entry = outline.find((candidate) => candidate.id === id);
    if (entry) return entry;
  }
  return undefined;
}
