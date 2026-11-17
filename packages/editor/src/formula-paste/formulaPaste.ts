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
import { readClipboardFormulas } from './readClipboardFormulas';

export const FORMULA_PASTE_PHRASES = {
  notice: 'Pasted as equation',
  pasteAsText: 'Paste as text',
} as const;

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
function conversionAt(state: EditorState, markdown: string) {
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

async function insertConversion(
  view: EditorView,
  pieces: Parameters<typeof formulaMarkdown>[0],
  { plainText, rendering }: { readonly plainText: string; readonly rendering: RichTextRendering },
): Promise<void> {
  const markdown = await formulaMarkdown(pieces, conversionWith(rendering));
  if (markdown === undefined) {
    insertClipboardText(view, plainText);
    return;
  }
  const conversion = conversionAt(view.state, markdown);
  const notice = { position: conversion.selection.main.head, plainText };
  view.dispatch(conversion, {
    userEvent: 'input.paste',
    annotations: PASTE_HISTORY,
    effects: [showNotice.of(notice), EditorView.announce.of(view.state.phrase(FORMULA_PASTE_PHRASES.notice))],
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
    borderRadius: 'var(--radius-small, 4px)',
    padding: '0.125rem 0.5rem',
    cursor: 'pointer',
  },
});

/** The Pasted as equation notice: Escape, typing and the focus leaving the editor close it. */
export function formulaPasteNotice(): Extension {
  const close = (view: EditorView): boolean => {
    if (!view.state.field(noticeField)) return false;
    view.dispatch({ effects: closeNotice.of(null) });
    return true;
  };
  return [
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
