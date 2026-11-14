import {
  deleteSnippet,
  saveSnippet,
  setBuiltInSnippetHidden,
  type Snippet,
  type SnippetLibrary,
} from '@mdx/core';

export type SnippetLibraryCommand =
  | { readonly kind: 'saveSnippet'; readonly snippet: Snippet }
  | { readonly kind: 'deleteSnippet'; readonly snippetId: string }
  | { readonly kind: 'setBuiltInSnippetHidden'; readonly snippetId: string; readonly isHidden: boolean };

export type SnippetCommand =
  SnippetLibraryCommand | { readonly kind: 'insertSnippet'; readonly snippetId: string };

const LIBRARY_COMMAND_KINDS: readonly string[] = ['saveSnippet', 'deleteSnippet', 'setBuiltInSnippetHidden'];

export function isSnippetLibraryCommand(command: {
  readonly kind: string;
}): command is SnippetLibraryCommand {
  return LIBRARY_COMMAND_KINDS.includes(command.kind);
}

export function applySnippetLibraryCommand(
  library: SnippetLibrary,
  command: SnippetLibraryCommand,
): SnippetLibrary {
  if (command.kind === 'saveSnippet') return saveSnippet(library, command.snippet);
  if (command.kind === 'deleteSnippet') return deleteSnippet(library, command.snippetId);
  return setBuiltInSnippetHidden(library, command.snippetId, command.isHidden);
}
