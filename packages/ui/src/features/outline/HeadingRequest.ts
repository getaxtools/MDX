import type { OutlineEntry } from '@mdx/renderer';

/** A heading chosen in the outline or the breadcrumbs, numbered so the same heading can be chosen again. */
export interface HeadingRequest {
  readonly entry: OutlineEntry;
  readonly number: number;
}
