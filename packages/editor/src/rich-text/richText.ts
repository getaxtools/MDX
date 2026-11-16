import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { editClickedFormula } from '../formulas/formulaRequests';
import { blockLayer } from './blockLayer';
import { inlineMarkupLayer } from './inlineMarkupLayer';
import { openClickedLink } from './linkOpening';
import { RICH_TEXT_CLASS } from './richTextClasses';
import { richTextTheme } from './richTextTheme';
import { keepCaretOnCheckbox, toggleClickedTask, toggleTasksAtCaret } from './taskToggle';
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
      mousedown: (event, view) =>
        openClickedLink(event, view) || keepCaretOnCheckbox(event, view) || editClickedFormula(event, view),
      // A click without a press, as assistive technology sends, edits a formula too.
      click: (event, view) => toggleClickedTask(event, view) || editClickedFormula(event, view),
    }),
  ];
}
