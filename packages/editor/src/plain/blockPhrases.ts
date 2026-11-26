import type { BlockKind } from '../blocks/markdownBlocks';

/** The words the block tools announce: CodeMirror phrases the app translates, with no editor code. */
export const BLOCK_KIND_PHRASES: Readonly<Record<BlockKind, string>> = {
  paragraph: 'paragraph',
  heading: 'heading',
  list: 'list',
  listItem: 'list item',
  codeBlock: 'code block',
  table: 'table',
  quote: 'quote',
  mathBlock: 'math block',
  htmlBlock: 'HTML block',
  horizontalRule: 'horizontal rule',
};

export const BLOCK_MOVE_PHRASES = {
  movedUp: 'Moved $1 up.',
  movedDown: 'Moved $1 down.',
  first: 'This is the first block.',
  last: 'This is the last block.',
} as const;

/** The handle's accessible name: the block's kind, then its first words. */
export const BLOCK_HANDLE_PHRASE = 'Actions for the $1 starting “$2”';
