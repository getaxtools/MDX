import { Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** The Document style the preview uses; Rich text takes its fonts from it. */
export type EditorTypography = 'github' | 'book' | 'academic';

export const DEFAULT_EDITOR_TYPOGRAPHY: EditorTypography = 'github';
export const TYPOGRAPHY_ATTRIBUTE = 'data-typography';

const typographyCompartment = new Compartment();

function typographyAttribute(typography: EditorTypography): Extension {
  return EditorView.editorAttributes.of({ [TYPOGRAPHY_ATTRIBUTE]: typography });
}

export function typographyExtension(typography: EditorTypography): Extension {
  return typographyCompartment.of(typographyAttribute(typography));
}

export function setTypography(view: EditorView, typography: EditorTypography): void {
  view.dispatch({ effects: typographyCompartment.reconfigure(typographyAttribute(typography)) });
}
