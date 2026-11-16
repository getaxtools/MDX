import { Compartment, Facet, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Rich text shows the document like the preview with the Markdown where the caret is; Source shows it all. */
export type EditingMode = 'richText' | 'source';

export const DEFAULT_EDITING_MODE: EditingMode = 'source';

/** The mode an editor is in, for extensions that behave differently in each. */
export const editingModeFacet = Facet.define<EditingMode, EditingMode>({
  combine: (modes) => modes[0] ?? DEFAULT_EDITING_MODE,
});

export function editingModeOf(state: EditorState): EditingMode {
  return state.facet(editingModeFacet);
}

/** What Rich text adds to the editor; its layers come with the later Rich text work. */
function richTextExtensions(): Extension {
  return [];
}

function modeExtensions(mode: EditingMode): Extension {
  return [editingModeFacet.of(mode), mode === 'richText' ? richTextExtensions() : []];
}

/**
 * The mode lives in a compartment, so a switch reconfigures the editor without a document change:
 * the text, the selection, the undo history and the scroll position stay.
 */
export function editingModeSwitch(
  initialMode: EditingMode,
  onEditingModeChange?: (mode: EditingMode) => void,
): {
  readonly extension: Extension;
  readonly switchTo: (view: EditorView, mode: EditingMode) => void;
} {
  const compartment = new Compartment();
  const reportChange = EditorView.updateListener.of((update) => {
    const mode = editingModeOf(update.state);
    if (mode !== editingModeOf(update.startState)) onEditingModeChange?.(mode);
  });
  return {
    extension: [compartment.of(modeExtensions(initialMode)), reportChange],
    switchTo: (view, mode) => {
      if (editingModeOf(view.state) === mode) return;
      view.dispatch({ effects: compartment.reconfigure(modeExtensions(mode)) });
    },
  };
}
