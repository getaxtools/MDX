import { Facet } from '@codemirror/state';
import type { Command } from '@codemirror/view';

/** Lets the user choose picture files to copy next to the document; the app links them at the caret. */
export const pictureChooserFacet = Facet.define<() => void, (() => void) | undefined>({
  combine: (choosers) => choosers[0],
});

/** The Image button and Ctrl+Shift+I; nothing happens in an editor the app gives no picture chooser. */
export const choosePictureFiles: Command = (view) => {
  const choose = view.state.facet(pictureChooserFacet);
  if (!choose) return false;
  choose();
  return true;
};
