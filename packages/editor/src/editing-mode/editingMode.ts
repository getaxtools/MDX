import { Compartment, Facet, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { richTextExtensions } from '../rich-text/richText';

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

/**
 * The mode lives in a compartment, so a switch reconfigures the editor without a document change:
 * the text, the selection, the undo history and the scroll position stay.
 */
const editingModeCompartment = new Compartment();

function modeExtensions(mode: EditingMode): Extension {
  return [editingModeFacet.of(mode), mode === 'richText' ? richTextExtensions() : []];
}

export function editingModeExtension(
  initialMode: EditingMode,
  onEditingModeChange?: (mode: EditingMode) => void,
): Extension {
  const reportChange = EditorView.updateListener.of((update) => {
    const mode = editingModeOf(update.state);
    if (mode !== editingModeOf(update.startState)) onEditingModeChange?.(mode);
  });
  return [editingModeCompartment.of(modeExtensions(initialMode)), reportChange];
}

/** Switches an editor between Rich text and Source without changing the text, the selection or the undo history. */
export function setEditingMode(view: EditorView, mode: EditingMode): void {
  if (editingModeOf(view.state) === mode) return;
  view.dispatch({ effects: editingModeCompartment.reconfigure(modeExtensions(mode)) });
}
