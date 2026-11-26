import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** Colours and fonts come from the app's design tokens, so light, dark and contrast themes apply. */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: 'var(--space-4) 0', caretColor: 'var(--color-text)' },
  '.cm-line': { padding: '0 var(--space-6)' },
  '.cm-cursor, .cm-dropCursor': { borderInlineStartColor: 'var(--color-text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--color-surface-selected)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    borderBottom: '1px solid var(--color-border)',
  },
  '.cm-panels input, .cm-panels button': { font: 'inherit', color: 'inherit' },
  '.cm-searchMatch': {
    backgroundColor: 'var(--color-notice-background)',
    outline: '1px solid var(--color-notice-border)',
  },
  '&.cm-editor .cm-tooltip': {
    backgroundColor: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 'var(--radius-medium)',
  },
  // As specific as CodeMirror's own light-theme rules, which use a grey too faint for white text.
  '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--color-surface-selected)',
    color: 'var(--color-text)',
  },
  '&.cm-editor .cm-tooltip .cm-completionDetail': { color: 'var(--color-text-secondary)' },
});

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'var(--color-accent)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--color-accent)' },
  {
    tag: [tags.quote, tags.processingInstruction, tags.meta, tags.comment],
    color: 'var(--color-text-secondary)',
  },
  { tag: tags.monospace, backgroundColor: 'var(--color-code-background)' },
]);
