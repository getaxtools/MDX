import { forceParsing } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

const PARSE_TIMEOUT_MS = 5_000;

/**
 * Tests look at the editor right after it opens. CodeMirror parses only for a few milliseconds before
 * it shows the editor, which a busy test machine may not reach the end of the document in.
 */
export function parseWholeDocument(view: EditorView): void {
  forceParsing(view, view.state.doc.length, PARSE_TIMEOUT_MS);
}
