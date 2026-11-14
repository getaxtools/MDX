import type { SlashMenuProvider } from '../slash-menu/slashMenu';
import { snippetInsertion, type SnippetExpander } from './snippetFields';

/** A snippet as the editor offers it; the app expands its variables when it is inserted. */
export interface EditorSnippet {
  readonly id: string;
  readonly name: string;
  readonly trigger: string;
  readonly expand: SnippetExpander;
}

export const SNIPPETS_SECTION = 'Snippets';

/** Snippets as a group of the insert menu, found by name and trigger word. */
export function snippetMenuProvider(snippets: readonly EditorSnippet[]): SlashMenuProvider {
  return {
    section: SNIPPETS_SECTION,
    items: () =>
      snippets.map((snippet) => ({
        id: snippet.id,
        name: snippet.name,
        description: snippet.trigger,
        aliases: snippet.trigger === '' ? [] : [snippet.trigger.toLowerCase()],
        insert: (state, range) => snippetInsertion(state, range, snippet.expand),
      })),
  };
}
