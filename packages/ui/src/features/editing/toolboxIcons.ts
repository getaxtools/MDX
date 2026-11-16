import type { ToolboxAction } from '@mdx/editor';

/** Stroke paths on a 24 by 24 grid, drawn in the document toolbar's hand-drawn style. */
export const TOOLBOX_ICONS: Readonly<
  Partial<Record<ToolboxAction | 'heading' | 'math' | 'richText' | 'more', readonly string[]>>
> = {
  heading: ['M5 5v14', 'M13 5v14', 'M5 12h8', 'M16 19h4', 'M18 19v-7l-2 1.5'],
  bold: ['M7 5h6a3.5 3.5 0 0 1 0 7H7z', 'M7 12h7a3.5 3.5 0 0 1 0 7H7z'],
  italic: ['M10 5h8', 'M6 19h8', 'M14 5l-4 14'],
  strikethrough: [
    'M5 12h14',
    'M16 7.5A4 3 0 0 0 12 5c-2.5 0-4 1.3-4 3s2 2.5 4 3',
    'M8 16.5A4 3 0 0 0 12 19c2.5 0 4-1.3 4-3',
  ],
  inlineCode: ['M9 7l-5 5 5 5', 'M15 7l5 5-5 5'],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  bulletList: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M5 6h.01', 'M5 12h.01', 'M5 18h.01'],
  numberedList: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M4 5l1.5-1v4', 'M4 14h3l-3 4h3'],
  taskList: ['M4 5h4v4H4z', 'M4 15h4v4H4z', 'M11 7h9', 'M11 17h9', 'M5 17l1 1 2-2'],
  quote: ['M5 6v12', 'M9 8h10', 'M9 12h10', 'M9 16h6'],
  codeBlock: ['M4 5h16v14H4z', 'M9 10l-2 2 2 2', 'M15 10l2 2-2 2'],
  table: ['M4 5h16v14H4z', 'M4 10h16', 'M4 15h16', 'M10 5v14'],
  horizontalRule: ['M4 12h16', 'M8 7h8', 'M8 17h8'],
  math: ['M17 5H7l5 7-5 7h10'],
  richText: ['M5 19l4-12 4 12', 'M6.5 15h5', 'M15 11h5', 'M15 15h5', 'M15 19h5'],
  more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
};
