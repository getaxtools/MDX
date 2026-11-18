/**
 * The words of the insert menu's built-in items: CodeMirror phrases the app translates. Kept apart
 * from the editor, so the app can list them at start without loading it.
 */
export interface SlashItemText {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** English words that also find the item, whatever the display language. */
  readonly aliases: readonly string[];
}

export const SLASH_ITEM_TEXTS: readonly SlashItemText[] = [
  {
    id: 'heading1',
    name: 'Heading 1',
    description: 'Large section heading',
    aliases: ['h1', 'title'],
  },
  {
    id: 'heading2',
    name: 'Heading 2',
    description: 'Medium section heading',
    aliases: ['h2', 'subtitle'],
  },
  {
    id: 'heading3',
    name: 'Heading 3',
    description: 'Small section heading',
    aliases: ['h3'],
  },
  {
    id: 'bulletList',
    name: 'Bulleted list',
    description: 'A list with bullets',
    aliases: ['ul', 'bullet', 'list'],
  },
  {
    id: 'numberedList',
    name: 'Numbered list',
    description: 'A list with numbers',
    aliases: ['ol', 'number', 'ordered'],
  },
  {
    id: 'taskList',
    name: 'Task list',
    description: 'A list with checkboxes',
    aliases: ['todo', 'task', 'checkbox'],
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'Quoted text',
    aliases: ['blockquote', 'citation'],
  },
  {
    id: 'callout',
    name: 'Callout',
    description: 'A highlighted note',
    aliases: ['note', 'alert', 'admonition'],
  },
  {
    id: 'toggle',
    name: 'Toggle',
    description: 'A section that folds away',
    aliases: ['details', 'collapse', 'fold'],
  },
  {
    id: 'codeBlock',
    name: 'Code block',
    description: 'Code with syntax colours',
    aliases: ['code', 'pre', 'fence'],
  },
  {
    id: 'table',
    name: 'Table',
    description: 'Rows and columns',
    aliases: ['grid', 'columns', 'rows'],
  },
  {
    id: 'horizontalRule',
    name: 'Divider',
    description: 'A horizontal line',
    aliases: ['hr', 'rule', 'separator', 'line'],
  },
  {
    id: 'image',
    name: 'Image',
    description: 'A picture from a file or address',
    aliases: ['img', 'picture', 'photo'],
  },
  {
    id: 'inlineMath',
    name: 'Inline math',
    description: 'A formula inside the text',
    aliases: ['math', 'formula', 'latex', 'equation'],
  },
  {
    id: 'displayMath',
    name: 'Display math',
    description: 'A formula on its own line',
    aliases: ['math', 'formula', 'latex', 'equation', 'katex'],
  },
  {
    id: 'diagram',
    name: 'Diagram',
    description: 'A Mermaid diagram',
    aliases: ['mermaid', 'chart', 'flowchart', 'graph'],
  },
];
