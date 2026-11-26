import type { WrittenLink } from '@mdx/editor';
import { linkKindOf, previewLinkHref, type OutlineEntry } from '@mdx/renderer';
import type { DocumentLink } from '../document-view/DocumentLink';
import { linkedHeadingIds } from '../document-view/findLinkedHeading';

/** Where a link opened from the editor goes: another document, a web address, or a heading of this one. */
export type EditorLinkTarget =
  | { readonly kind: 'document' | 'external'; readonly link: DocumentLink }
  | { readonly kind: 'heading'; readonly fragment: string };

/**
 * Turns a link as written into the href the preview gives it and classifies that href with the
 * preview's rules, so the editor opens exactly what the preview would.
 */
export function editorLinkTarget(written: WrittenLink): EditorLinkTarget | undefined {
  const href = previewLinkHref(written);
  const kind = href === undefined ? undefined : linkKindOf(href);
  if (href === undefined || kind === undefined) return undefined;
  if (kind === 'anchor') return { kind: 'heading', fragment: href.slice(1) };
  return { kind, link: { kind, href } };
}

export interface EditorLinkActions {
  readonly openLink: (link: DocumentLink) => void;
  readonly goToHeading: (entry: OutlineEntry) => void;
}

/** Opens a link from the editor where the preview's link goes: a document, the browser after asking, or a heading. */
export function openLinkFromEditor(
  written: WrittenLink,
  outline: readonly OutlineEntry[],
  actions: EditorLinkActions,
): void {
  const target = editorLinkTarget(written);
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
