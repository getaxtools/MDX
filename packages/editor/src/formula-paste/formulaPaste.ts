import { isolateHistory, undo } from '@codemirror/commands';
import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { richTextRenderingFacet, type RichTextRendering } from '../rich-text/richTextRendering';
import { formulaMarkdown, type FormulaConversion } from './formulaMarkdown';
import { texOfMathml } from './mathmlToTex';
import { FORMULA_PASTE_PHRASES } from '../plain/formulaPastePhrases';
import { readClipboardFormulas } from './readClipboardFormulas';

export { FORMULA_PASTE_PHRASES } from '../plain/formulaPastePhrases';

interface PasteNotice {
  /** Where the converted text ends, which the notice is shown at. */
  readonly position: number;
  /** The clipboard's plain text, which Paste as text puts in place of the conversion. */
  readonly plainText: string;
}

const showNotice = StateEffect.define<PasteNotice>();
const closeNotice = StateEffect.define();

const noticeField = StateField.define<PasteNotice | undefined>({
  create: () => undefined,
  update: (notice, transaction) => {
    let shown = transaction.docChanged ? undefined : notice;
    for (const effect of transaction.effects) {
      if (effect.is(showNotice)) shown = effect.value;
      if (effect.is(closeNotice)) shown = undefined;
    }
    return shown;
  },
  provide: (field) => showTooltip.from(field, (notice) => (notice ? noticeTooltip(notice) : null)),
});

/** A paste whose conversion is still loading or typesetting, with where it goes, mapped through later changes. */
interface PendingPaste {
  readonly id: number;
  readonly selection: EditorSelection;
  readonly isDocumentChanged: boolean;
}

const startPendingPaste = StateEffect.define<number>();
const endPendingPaste = StateEffect.define<number>();

const pendingPastes = StateField.define<readonly PendingPaste[]>({
  create: () => [],
  update: (pastes, transaction) => {
    let updated = transaction.docChanged
      ? pastes.map((paste) => ({
          ...paste,
          selection: paste.selection.map(transaction.changes),
          isDocumentChanged: true,
        }))
      : pastes;
    for (const effect of transaction.effects) {
      if (effect.is(startPendingPaste)) {
        updated = [
          ...updated,
          { id: effect.value, selection: transaction.state.selection, isDocumentChanged: false },
        ];
      }
      if (effect.is(endPendingPaste)) updated = updated.filter((paste) => paste.id !== effect.value);
    }
    return updated;
  },
});

let lastPasteId = 0;

/** One undo removes the paste, so it never joins the typing before or after it. */
const PASTE_HISTORY = isolateHistory.of('full');

function noticeTooltip(notice: PasteNotice): Tooltip {
  return {
    pos: notice.position,
    above: false,
    create: (view) => {
      const dom = document.createElement('div');
      dom.className = 'cm-formula-paste-notice';
      const message = document.createElement('span');
      message.textContent = view.state.phrase(FORMULA_PASTE_PHRASES.notice);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = view.state.phrase(FORMULA_PASTE_PHRASES.pasteAsText);
      // The editor keeps the focus, so the notice does not close before the click.
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => pasteAsText(view));
      dom.append(message, button);
      return { dom };
    },
  };
}

/** Puts the clipboard's plain text in place of the conversion: one Ctrl+Z then restores the text before the paste. */
export function pasteAsText(view: EditorView): boolean {
  const notice = view.state.field(noticeField, false);
  if (!notice || !undo(view)) return false;
  view.dispatch(view.state.replaceSelection(notice.plainText), {
    userEvent: 'input.paste',
    annotations: PASTE_HISTORY,
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

function insertClipboardText(view: EditorView, text: string): void {
  if (text === '') return;
  view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
}

/** Display math needs lines of its own, so a line break goes between it and text on the same line. */
function conversionOver(state: EditorState, markdown: string) {
  return state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const isTextBefore = state.sliceDoc(line.from, range.from).trim() !== '';
    const isTextAfter = state.sliceDoc(range.to, endLine.to).trim() !== '';
    const before = markdown.startsWith('$$\n') && isTextBefore ? '\n' : '';
    const after = markdown.endsWith('\n$$') && isTextAfter ? '\n' : '';
    const insert = `${before}${markdown}${after}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });
}

function conversionWith(rendering: RichTextRendering): FormulaConversion {
  return {
    texOfMathml,
    isTypeset: async (tex, isDisplay) => (await rendering.typesetMath(tex, isDisplay)) !== undefined,
  };
}

/**
 * Writes the conversion where the paste was. When the document changed while the conversion
 * loaded, the plain text goes there instead, at that place mapped through the changes.
 */
async function insertConversion(
  view: EditorView,
  pieces: Parameters<typeof formulaMarkdown>[0],
  { plainText, rendering }: { readonly plainText: string; readonly rendering: RichTextRendering },
): Promise<void> {
  lastPasteId += 1;
  const id = lastPasteId;
  view.dispatch({ effects: startPendingPaste.of(id) });
  const markdown = await formulaMarkdown(pieces, conversionWith(rendering));
  const pending = view.state.field(pendingPastes).find((paste) => paste.id === id);
  if (!pending) return;
  const atPaste = view.state.update({ selection: pending.selection }).state;
  const isConverted = markdown !== undefined && !pending.isDocumentChanged;
  if (!isConverted) {
    const plainPaste = plainText === '' ? {} : atPaste.replaceSelection(plainText);
    view.dispatch(plainPaste, {
      userEvent: 'input.paste',
      effects: endPendingPaste.of(id),
      scrollIntoView: true,
    });
    return;
  }
  const conversion = conversionOver(atPaste, markdown);
  const notice = { position: conversion.selection.main.head, plainText };
  view.dispatch(conversion, {
    userEvent: 'input.paste',
    annotations: PASTE_HISTORY,
    effects: [
      endPendingPaste.of(id),
      showNotice.of(notice),
      EditorView.announce.of(view.state.phrase(FORMULA_PASTE_PHRASES.notice)),
    ],
    scrollIntoView: true,
  });
}

/**
 * Pasted formulas become dollar math: TeX delimiters in plain text, then the TeX annotations,
 * alternative text or MathML of HTML. Each is checked with the typesetter first, and one that fails
 * pastes the plain text unconverted; HTML that is too large, too deep or malformed pastes as text.
 * Returns false when the clipboard holds no formula, so the paste goes on as usual.
 */
export function pasteFormulas(event: ClipboardEvent, view: EditorView): boolean {
  const clipboard = event.clipboardData;
  const rendering = view.state.facet(richTextRenderingFacet);
  if (!clipboard || !rendering) return false;
  const plainText = clipboard.getData('text/plain');
  const formulas = readClipboardFormulas({ text: plainText, html: clipboard.getData('text/html') });
  if (formulas.kind === 'none') return false;
  event.preventDefault();
  if (formulas.kind === 'refused') insertClipboardText(view, plainText);
  else void insertConversion(view, formulas.pieces, { plainText, rendering });
  return true;
}

const noticeTheme = EditorView.theme({
  '.cm-formula-paste-notice': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.5rem',
    font: 'var(--font-ui, inherit)',
  },
  '.cm-formula-paste-notice button': {
    font: 'inherit',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 'var(--radius-xsmall)',
    padding: '0.125rem 0.5rem',
    cursor: 'pointer',
  },
});

/**
 * The state formula pastes need: the pastes still converting, and the Pasted as equation notice,
 * which Escape, typing and the focus leaving the editor close.
 */
export function formulaPasteState(): Extension {
  const close = (view: EditorView): boolean => {
    if (!view.state.field(noticeField)) return false;
    view.dispatch({ effects: closeNotice.of(null) });
    return true;
  };
  return [
    pendingPastes,
    noticeField,
    noticeTheme,
    Prec.highest(keymap.of([{ key: 'Escape', run: close }])),
    EditorView.domEventHandlers({
      focusout: (event, view) => {
        const isFocusStaying = event.relatedTarget instanceof Node && view.dom.contains(event.relatedTarget);
        if (!isFocusStaying) close(view);
        return false;
      },
    }),
  ];
}
