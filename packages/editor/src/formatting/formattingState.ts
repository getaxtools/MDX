import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '../syntax/syntaxNode';
import { enclosingNode, INLINE_FORMAT_SYNTAX } from './inlineFormatting';

/** Toolbox buttons that show whether the selection already has their formatting. */
export type PressableFormat =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'bulletList'
  | 'numberedList'
  | 'taskList'
  | 'quote';

/** The formatting at the main selection, for the toolbox's pressed buttons and heading menu. */
export interface FormattingState {
  readonly pressed: readonly PressableFormat[];
  /** The heading level of the caret's line, 0 for a paragraph. */
  readonly headingLevel: number;
}

const INLINE_PRESSABLE: readonly (readonly [PressableFormat, string])[] = [
  ['bold', INLINE_FORMAT_SYNTAX.strong.nodeName],
  ['italic', INLINE_FORMAT_SYNTAX.emphasis.nodeName],
  ['strikethrough', INLINE_FORMAT_SYNTAX.strikethrough.nodeName],
  ['inlineCode', INLINE_FORMAT_SYNTAX.inlineCode.nodeName],
  ['link', 'Link'],
];
const HEADING_NODE = /^(?:ATX|Setext)Heading(\d)$/;

function ancestorNames(state: EditorState, position: number): string[] {
  const names: string[] = [];
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1); node; node = node.parent) {
    names.push(node.name);
  }
  return names;
}

function blockFormatsAt(names: readonly string[]): PressableFormat[] {
  const formats: PressableFormat[] = [];
  if (names.includes('Task')) formats.push('taskList');
  else if (names.includes('BulletList')) formats.push('bulletList');
  if (names.includes('OrderedList') && !names.includes('Task')) formats.push('numberedList');
  if (names.includes('Blockquote')) formats.push('quote');
  return formats;
}

/** A selection over text with and without a format shows that format as not pressed. */
export function formattingStateOf(state: EditorState): FormattingState {
  const main = state.selection.main;
  const inline = INLINE_PRESSABLE.filter(
    ([, nodeName]) => enclosingNode(state, main, nodeName) !== undefined,
  );
  const lineStart = state.doc.lineAt(main.head).from;
  const names = ancestorNames(state, Math.max(main.head, lineStart));
  const heading = names.map((name) => HEADING_NODE.exec(name)?.[1]).find((level) => level !== undefined);
  return {
    pressed: [...inline.map(([format]) => format), ...blockFormatsAt(names)],
    headingLevel: heading === undefined ? 0 : Number(heading),
  };
}
