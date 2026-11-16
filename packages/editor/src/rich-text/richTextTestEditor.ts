import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseWholeDocument } from './parseWholeDocument';
import { vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';
import type { RichTextRendering } from './richTextRendering';

let renderingCount = 0;

/** A rendering port for tests: HTML that names what was rendered, and plain labels. */
export function fakeRichTextRendering(overrides: Partial<RichTextRendering> = {}): RichTextRendering {
  renderingCount += 1;
  return {
    documentKey: `test-document-${String(renderingCount)}`,
    renderBlock: (markdown) => `<div class="rendered">${String(markdown.length)} characters</div>`,
    typesetMath: (tex) => Promise.resolve(`<span class="typeset">${String(tex.length)} characters</span>`),
    callout: (type, ownTitle) => {
      const looks: Readonly<Record<string, string>> = { tip: 'tip', note: 'note', danger: 'caution' };
      const look = looks[type.toLowerCase()];
      return look === undefined ? undefined : { look, title: ownTitle || `${type.toLowerCase()} title` };
    },
    labels: {
      formula: (source) => `Formula ${source}`,
      table: (rows, columns) => `Table, ${String(rows)} rows, ${String(columns)} columns`,
      properties: (count) => `${String(count)} properties`,
      diagram: (type) => `Diagram, ${type}`,
      task: () => 'Task',
    },
    ...overrides,
  };
}

export interface TestEditor {
  readonly editor: SourceEditor;
  readonly view: EditorView;
  readonly onChange: ReturnType<typeof vi.fn>;
  readonly close: () => void;
}

export type TestEditorOptions = Partial<SourceEditorOptions> & {
  /** False for an app that supplies no rendering port. */
  readonly hasRendering?: boolean;
};

/** An editor in Rich text with the caret at the end. */
export function openRichTextEditor(text: string, options: TestEditorOptions = {}): TestEditor {
  const { hasRendering = true, ...editorOptions } = options;
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  const editor = createSourceEditor({
    parent,
    text,
    label: 'Source',
    phrases: {},
    onChange,
    editingMode: 'richText',
    ...(hasRendering ? { richTextRendering: fakeRichTextRendering() } : {}),
    ...editorOptions,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  parseWholeDocument(view);
  view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
  return {
    editor,
    view,
    onChange,
    close: () => {
      editor.destroy();
      parent.remove();
    },
  };
}

export function shownLines(view: EditorView): string[] {
  return [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);
}

export function placeCaret(view: EditorView, position: number): void {
  view.dispatch({ selection: EditorSelection.cursor(position) });
}
