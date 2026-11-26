import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isComposing } from '../rich-text/compositionHold';

/** Editors whose next paste was asked to be plain text, by the key press that is still down. */
const plainPasteRequests = new WeakSet<EditorView>();

function isPlainPasteKey(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'v'
  );
}

// eslint-disable-next-line no-control-regex -- control characters are what it finds
const CONTROL_CHARACTERS_BUT_TAB_AND_LINE_FEED = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Clipboard text as the editor takes it, the same for Ctrl+Shift+V and the Edit menu: every line
 * break written as a line feed and other control characters but tab left out. Direction marks are
 * kept, as right-to-left text needs them.
 */
export function plainPasteText(text: string): string {
  return text.replaceAll(/\r\n?/g, '\n').replaceAll(CONTROL_CHARACTERS_BUT_TAB_AND_LINE_FEED, '');
}

/** Inserts clipboard text as plain text, as one undo step of its own, like any other paste. */
export function insertPlainText(view: EditorView, text: string): void {
  const plainText = plainPasteText(text);
  if (plainText === '') return;
  view.dispatch(view.state.replaceSelection(plainText), { userEvent: 'input.paste', scrollIntoView: true });
}

/**
 * Ctrl+Shift+V pastes the clipboard's plain text exactly, skipping every paste conversion, picture
 * files included. The key press asks for it and the paste the browser fires for that press uses it;
 * the request ends with the key press, so a later ordinary paste is not affected.
 */
export function plainTextPaste(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (isPlainPasteKey(event) && !event.isComposing && !isComposing(view)) plainPasteRequests.add(view);
        return false;
      },
      keyup: (_event, view) => {
        plainPasteRequests.delete(view);
        return false;
      },
      paste: (event, view) => {
        if (!plainPasteRequests.delete(view)) return false;
        event.preventDefault();
        insertPlainText(view, event.clipboardData?.getData('text/plain') ?? '');
        return true;
      },
    }),
  );
}
