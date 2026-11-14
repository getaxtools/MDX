import { expandSnippet } from '@mdx/core';
import type { SnippetExpander } from '@mdx/editor';

const FILE_EXTENSION = /\.[^.]+$/;

/** Fills a snippet body for a document: its title is the file name without the extension. */
export function snippetExpander(
  body: string,
  { fileName, locale }: { fileName: string; locale: string },
): SnippetExpander {
  const title = fileName.replace(FILE_EXTENSION, '');
  return (selection) => expandSnippet(body, { now: new Date(), locale, title, selection });
}
