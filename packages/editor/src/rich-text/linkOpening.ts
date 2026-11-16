import { Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { linkAddressAt } from './linkTargets';
import { LINK_TEXT_CLASS } from './richTextClasses';

type LinkOpener = (address: string) => void;

const MAIN_BUTTON = 0;

/** Opens a link's address the way the preview opens it; the app supplies it. */
export const linkOpener = Facet.define<LinkOpener, LinkOpener | undefined>({
  combine: (openers) => openers[0],
});

function openAddress(view: EditorView, address: string | undefined): boolean {
  const open = view.state.facet(linkOpener);
  if (address === undefined || !open) return false;
  open(address);
  return true;
}

export function openLinkAtCaret(view: EditorView): boolean {
  return openAddress(view, linkAddressAt(view.state, view.state.selection.main.head));
}

/** Ctrl+click on link text opens the link instead of placing the caret; Alt+click still adds a cursor. */
export function openClickedLink(event: MouseEvent, view: EditorView): boolean {
  if (!event.ctrlKey || event.altKey || event.button !== MAIN_BUTTON) return false;
  if (!(event.target instanceof Element)) return false;
  const linkText = event.target.closest(`.${LINK_TEXT_CLASS}`);
  if (!linkText || !view.contentDOM.contains(linkText)) return false;
  return openAddress(view, linkAddressAt(view.state, view.posAtDOM(linkText)));
}
