import { Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isComposing } from './compositionHold';
import { linkAt, type WrittenLink } from './linkTargets';
import { LINK_TEXT_CLASS } from './richTextClasses';

type LinkOpener = (link: WrittenLink) => void;

const MAIN_BUTTON = 0;

/** Opens a link the way the preview opens it; the app supplies it. */
export const linkOpener = Facet.define<LinkOpener, LinkOpener | undefined>({
  combine: (openers) => openers[0],
});

function openLink(view: EditorView, link: WrittenLink | undefined): boolean {
  const open = view.state.facet(linkOpener);
  if (link === undefined || !open) return false;
  open(link);
  return true;
}

export function openLinkAtCaret(view: EditorView): boolean {
  return openLink(view, linkAt(view.state, view.state.selection.main.head));
}

/** Ctrl+click on link text opens the link instead of placing the caret; Alt+click still adds a cursor. */
export function openClickedLink(event: MouseEvent, view: EditorView): boolean {
  if (!event.ctrlKey || event.altKey || event.button !== MAIN_BUTTON || isComposing(view)) return false;
  if (!(event.target instanceof Element)) return false;
  const linkText = event.target.closest(`.${LINK_TEXT_CLASS}`);
  if (!linkText || !view.contentDOM.contains(linkText)) return false;
  return openLink(view, linkAt(view.state, view.posAtDOM(linkText)));
}
