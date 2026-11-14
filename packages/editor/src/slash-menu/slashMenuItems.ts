import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

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

interface ItemSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  /** The Markdown to insert, with `{caret}` where the caret goes, or at its end without one. */
  readonly markdown: (state: EditorState) => string;
  /** A block starts on a line of its own; inline Markdown goes where the slash was. */
  readonly placement: 'block' | 'inline';
}

const CARET = '{caret}';
const TABLE_COLUMNS = 3;
const TABLE_BODY_ROWS = 2;
const DEFAULT_BULLET = '-';

const ITEM_SPECS: readonly ItemSpec[] = [
  {
    id: 'heading1',
    name: 'Heading 1',
    description: 'Large section heading',
    aliases: ['h1', 'title'],
    placement: 'block',
    markdown: () => '# ',
  },
  {
    id: 'heading2',
    name: 'Heading 2',
    description: 'Medium section heading',
    aliases: ['h2', 'subtitle'],
    placement: 'block',
    markdown: () => '## ',
  },
  {
    id: 'heading3',
    name: 'Heading 3',
    description: 'Small section heading',
    aliases: ['h3'],
    placement: 'block',
    markdown: () => '### ',
  },
  {
    id: 'bulletList',
    name: 'Bulleted list',
    description: 'A list with bullets',
    aliases: ['ul', 'bullet', 'list'],
    placement: 'block',
    markdown: (state) => `${bulletMarkerOf(state)} `,
  },
  {
    id: 'numberedList',
    name: 'Numbered list',
    description: 'A list with numbers',
    aliases: ['ol', 'number', 'ordered'],
    placement: 'block',
    markdown: () => '1. ',
  },
  {
    id: 'taskList',
    name: 'Task list',
    description: 'A list with checkboxes',
    aliases: ['todo', 'task', 'checkbox'],
    placement: 'block',
    markdown: (state) => `${bulletMarkerOf(state)} [ ] `,
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'Quoted text',
    aliases: ['blockquote', 'citation'],
    placement: 'block',
    markdown: () => '> ',
  },
  {
    id: 'callout',
    name: 'Callout',
    description: 'A highlighted note',
    aliases: ['note', 'alert', 'admonition'],
    placement: 'block',
    markdown: () => '> [!NOTE]\n> ',
  },
  {
    id: 'toggle',
    name: 'Toggle',
    description: 'A section that folds away',
    aliases: ['details', 'collapse', 'fold'],
    placement: 'block',
    markdown: () => '> [!NOTE]-\n> ',
  },
  {
    id: 'codeBlock',
    name: 'Code block',
    description: 'Code with syntax colours',
    aliases: ['code', 'pre', 'fence'],
    placement: 'block',
    markdown: () => `\`\`\`\n${CARET}\n\`\`\``,
  },
  {
    id: 'table',
    name: 'Table',
    description: 'Rows and columns',
    aliases: ['grid', 'columns', 'rows'],
    placement: 'block',
    markdown: () => emptyTable(),
  },
  {
    id: 'horizontalRule',
    name: 'Divider',
    description: 'A horizontal line',
    aliases: ['hr', 'rule', 'separator', 'line'],
    placement: 'block',
    markdown: () => '---\n',
  },
  {
    id: 'image',
    name: 'Image',
    description: 'A picture from a file or address',
    aliases: ['img', 'picture', 'photo'],
    placement: 'inline',
    markdown: () => `![](${CARET})`,
  },
  {
    id: 'inlineMath',
    name: 'Inline math',
    description: 'A formula inside the text',
    aliases: ['math', 'formula', 'latex', 'equation'],
    placement: 'inline',
    markdown: () => `$${CARET}$`,
  },
  {
    id: 'displayMath',
    name: 'Display math',
    description: 'A formula on its own line',
    aliases: ['math', 'formula', 'latex', 'equation', 'katex'],
    placement: 'block',
    markdown: () => `$$\n${CARET}\n$$`,
  },
  {
    id: 'diagram',
    name: 'Diagram',
    description: 'A Mermaid diagram',
    aliases: ['mermaid', 'chart', 'flowchart', 'graph'],
    placement: 'block',
    markdown: () => `\`\`\`mermaid\n${CARET}\n\`\`\``,
  },
];

export const BUILT_IN_SLASH_ITEMS: readonly SlashMenuItem[] = ITEM_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  description: spec.description,
  aliases: spec.aliases,
  insert: (state, range) => insertItem(state, range, spec),
}));

/** The marker the document's lists already use, so a new list matches them. */
export function bulletMarkerOf(state: EditorState): string {
  let marker: string | undefined;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (marker !== undefined) return false;
      if (node.name === 'ListMark' && node.node.parent?.parent?.name === 'BulletList') {
        marker = state.sliceDoc(node.from, node.to);
      }
      return undefined;
    },
  });
  return marker ?? DEFAULT_BULLET;
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
