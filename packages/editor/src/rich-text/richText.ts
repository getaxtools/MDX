import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { blockLayer } from './blockLayer';
import { inlineMarkupLayer } from './inlineMarkupLayer';
import { openClickedLink } from './linkOpening';
import { RICH_TEXT_CLASS } from './richTextClasses';
import { richTextTheme } from './richTextTheme';
import { toggleClickedTask, toggleTasksAtCaret } from './taskToggle';
import { widgetTheme } from './widgetTheme';

/** What Rich text adds to the editor: its decoration layer, its look, and its keys and clicks. */
export function richTextExtensions(): Extension {
  return [
    EditorView.editorAttributes.of({ class: RICH_TEXT_CLASS }),
    richTextTheme,
    widgetTheme,
    inlineMarkupLayer,
    blockLayer,
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: toggleTasksAtCaret }])),
    EditorView.domEventHandlers({
      mousedown: (event, view) => openClickedLink(event, view) || toggleClickedTask(event, view),
    }),
  ];
}
