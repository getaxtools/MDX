/** The kinds a block can be turned into from its menu, in menu order. */
export type TurnIntoKind =
  'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'bulletList' | 'codeBlock';

export const TURN_INTO_KINDS: readonly TurnIntoKind[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'quote',
  'bulletList',
  'codeBlock',
];
