import type { FrontMatterEdit } from '@mdx/core';

export type PropertyCommand =
  | { readonly kind: 'editProperty'; readonly canonicalKey: string; readonly edit: FrontMatterEdit }
  | { readonly kind: 'editPropertiesInNote' };
