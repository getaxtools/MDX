import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { documentStyleOf } from '../formatting/documentStyle';
import { prefixFor } from '../formatting/lineFormatting';
import { SLASH_ITEM_TEXTS } from '../plain/slashItemTexts';

/** One entry of the insert menu; its name and description are CodeMirror phrases, translated by the app. */
export interface SlashMenuItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** English words that also find the item, whatever the display language. */
  readonly aliases: readonly string[];
  /** Replaces the slash text from `from` to `to` with the item's Markdown. */
  insert(state: EditorState, range: SlashTextRange): TransactionSpec;
}

export interface SlashTextRange {
  readonly from: number;
  readonly to: number;
}

/** How an item inserts its Markdown; its words are in `SLASH_ITEM_TEXTS`, which the app reads at start. */
interface ItemSpec {
  /** The Markdown to insert, with `{caret}` where the caret goes, or at its end without one. */
  readonly markdown: (state: EditorState) => string;
  /** A block starts on a line of its own; inline Markdown goes where the slash was. */
  readonly placement: 'block' | 'inline';
}

const CARET = '{caret}';
const TABLE_COLUMNS = 3;
const TABLE_BODY_ROWS = 2;

const ITEM_SPECS: Readonly<Record<string, ItemSpec>> = {
  heading1: { placement: 'block', markdown: () => '# ' },
  heading2: { placement: 'block', markdown: () => '## ' },
  heading3: { placement: 'block', markdown: () => '### ' },
  bulletList: { placement: 'block', markdown: (state) => prefixFor('bulletList', 1, documentStyleOf(state)) },
  numberedList: {
    placement: 'block',
    markdown: (state) => prefixFor('numberedList', 1, documentStyleOf(state)),
  },
  taskList: { placement: 'block', markdown: (state) => prefixFor('taskList', 1, documentStyleOf(state)) },
  quote: { placement: 'block', markdown: (state) => prefixFor('quote', 1, documentStyleOf(state)) },
  callout: { placement: 'block', markdown: () => '> [!NOTE]\n> ' },
  toggle: { placement: 'block', markdown: () => '> [!NOTE]-\n> ' },
  codeBlock: { placement: 'block', markdown: () => `\`\`\`\n${CARET}\n\`\`\`` },
  table: { placement: 'block', markdown: () => emptyTable() },
  horizontalRule: { placement: 'block', markdown: () => '---\n' },
  image: { placement: 'inline', markdown: () => `![](${CARET})` },
  inlineMath: { placement: 'inline', markdown: () => `$${CARET}$` },
  displayMath: { placement: 'block', markdown: () => `$$\n${CARET}\n$$` },
  diagram: { placement: 'block', markdown: () => `\`\`\`mermaid\n${CARET}\n\`\`\`` },
};

export const BUILT_IN_SLASH_ITEMS: readonly SlashMenuItem[] = SLASH_ITEM_TEXTS.flatMap((text) => {
  const spec = Object.hasOwn(ITEM_SPECS, text.id) ? ITEM_SPECS[text.id] : undefined;
  return spec ? [{ ...text, insert: (state, range) => insertItem(state, range, spec) }] : [];
});

/** Writes an insert menu item's Markdown over the main selection, as the toolbox does. */
export function insertMenuItemAtSelection(view: EditorView, itemId: string): void {
  const item = BUILT_IN_SLASH_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const { from, to } = view.state.selection.main;
  view.dispatch(item.insert(view.state, { from, to }), { userEvent: 'input.format', scrollIntoView: true });
}

/** A block after text on the same line goes on the next line, and the text stays. */
function insertItem(state: EditorState, range: SlashTextRange, spec: ItemSpec): TransactionSpec {
  const line = state.doc.lineAt(range.from);
  const isAloneOnLine = state.sliceDoc(line.from, range.from).trim() === '';
  const isBlock = spec.placement === 'block';
  const from = isBlock && isAloneOnLine ? line.from : range.from;
  const lead = isBlock && !isAloneOnLine ? '\n' : '';
  const markdown = spec.markdown(state);
  const caretIndex = markdown.includes(CARET) ? markdown.indexOf(CARET) : markdown.length;
  return {
    changes: { from, to: range.to, insert: lead + markdown.replace(CARET, '') },
    selection: EditorSelection.cursor(from + lead.length + caretIndex),
  };
}

function emptyTable(): string {
  const row = `|${'  |'.repeat(TABLE_COLUMNS)}`;
  const firstRow = `| ${CARET} |${'  |'.repeat(TABLE_COLUMNS - 1)}`;
  const delimiter = `|${' --- |'.repeat(TABLE_COLUMNS)}`;
  return [firstRow, delimiter, ...Array.from({ length: TABLE_BODY_ROWS }, () => row)].join('\n');
}
