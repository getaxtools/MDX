import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';
import { BYTE_EXACT_FIXTURES_FOLDER, documentFixtures } from './documentFixtures';
import { openDocumentBytes, savedDocumentBytes } from './documentBytes';
import { generatedDocumentBytes } from './generatedDocuments';

type ViewerAction =
  | { readonly kind: 'switchMode' }
  | { readonly kind: 'select'; readonly anchor: number; readonly head: number }
  | { readonly kind: 'addCursor'; readonly at: number }
  | { readonly kind: 'scroll'; readonly ratio: number };

interface DocumentLine {
  readonly text: string;
  readonly ending: string;
}

const RUNS_PER_FIXTURE = 15;
const unitInterval = fc.double({ min: 0, max: 1, noNaN: true });
const viewerAction: fc.Arbitrary<ViewerAction> = fc.oneof(
  fc.constant({ kind: 'switchMode' } as const),
  fc.record({ kind: fc.constant('select' as const), anchor: unitInterval, head: unitInterval }),
  fc.record({ kind: fc.constant('addCursor' as const), at: unitInterval }),
  fc.record({ kind: fc.constant('scroll' as const), ratio: unitInterval }),
);

let editor: SourceEditor | undefined;

function openInEditor(text: string) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  editor = createSourceEditor({ parent, text, label: 'Source', phrases: {}, onChange });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  return { editor, view, onChange };
}

function closeEditor(): void {
  editor?.destroy();
  editor = undefined;
  document.body.innerHTML = '';
}

function positionAt(view: EditorView, fraction: number): number {
  return Math.round(fraction * view.state.doc.length);
}

function perform(action: ViewerAction, opened: { editor: SourceEditor; view: EditorView }): void {
  const { view } = opened;
  if (action.kind === 'switchMode') {
    opened.editor.setEditingMode(opened.editor.editingMode() === 'source' ? 'richText' : 'source');
  } else if (action.kind === 'select') {
    view.dispatch({
      selection: EditorSelection.single(positionAt(view, action.anchor), positionAt(view, action.head)),
    });
  } else if (action.kind === 'addCursor') {
    view.dispatch({
      selection: view.state.selection.addRange(EditorSelection.cursor(positionAt(view, action.at))),
    });
  } else {
    opened.editor.scrollToRatio(action.ratio);
  }
}

/** Opens the bytes as the app does, acts on the editor without typing, and saves. */
function bytesAfterViewing(bytes: Uint8Array, actions: readonly ViewerAction[]) {
  const document = openDocumentBytes(bytes);
  const opened = openInEditor(document.text);
  const textBefore = opened.view.state.doc;
  for (const action of actions) perform(action, opened);
  const saved = savedDocumentBytes(opened.editor.text(), document);
  const outcome = {
    saved,
    isDocumentUnchanged: opened.view.state.doc.eq(textBefore),
    changes: opened.onChange,
  };
  closeEditor();
  return outcome;
}

describe('byte-exact editing', () => {
  afterEach(closeEditor);

  it('switching modes any number of times and saving gives the same bytes, in every fixture', () => {
    const fixtures = documentFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      fc.assert(
        fc.property(fc.array(viewerAction, { maxLength: 20 }), (actions) => {
          const { saved, isDocumentUnchanged, changes } = bytesAfterViewing(fixture.bytes, actions);

          expect(isDocumentUnchanged, fixture.name).toBe(true);
          expect(changes, fixture.name).not.toHaveBeenCalled();
          expect([...saved], fixture.name).toEqual([...fixture.bytes]);
        }),
        { numRuns: RUNS_PER_FIXTURE },
      );
    }
  });

  it('switching modes any number of times and saving gives the same bytes, in generated documents', () => {
    fc.assert(
      fc.property(generatedDocumentBytes(), fc.array(viewerAction, { maxLength: 20 }), (bytes, actions) => {
        const { saved, isDocumentUnchanged, changes } = bytesAfterViewing(bytes, actions);

        expect(isDocumentUnchanged).toBe(true);
        expect(changes).not.toHaveBeenCalled();
        expect([...saved]).toEqual([...bytes]);
      }),
    );
  });

  it('CRLF fixture still has CRLF after checkout', () => {
    const textOf = (fileName: string) =>
      new TextDecoder('utf-8', { ignoreBOM: true }).decode(
        readFileSync(join(BYTE_EXACT_FIXTURES_FOLDER, fileName)),
      );
    const crlf = textOf('crlf-with-bom.md');
    const mixed = textOf('mixed-line-endings.md');

    expect(crlf.startsWith('﻿')).toBe(true);
    expect(crlf).toContain('\r\n');
    expect(crlf.replaceAll('\r\n', '')).not.toContain('\n');
    expect(mixed).toContain('\r\n');
    expect(mixed.replaceAll('\r\n', '')).toContain('\n');
  });

  it("a mixed line ending file keeps each line's break after an edit and a save", () => {
    const line = fc.record({
      text: fc.stringMatching(/^[a-z ]{0,12}$/),
      ending: fc.constantFrom('\n', '\r\n'),
    });
    const firstTwoLines = fc.tuple(fc.stringMatching(/^[a-z ]{0,12}$/), fc.stringMatching(/^[a-z ]{0,12}$/));
    const mixedLines = fc
      .tuple(firstTwoLines, fc.array(line, { minLength: 1, maxLength: 10 }))
      .map(([[first, second], rest]): DocumentLine[] => [
        { text: first, ending: '\r\n' },
        { text: second, ending: '\n' },
        ...rest,
      ]);

    fc.assert(
      fc.property(mixedLines, fc.nat(), fc.nat(), (lines, lineChoice, columnChoice) => {
        const original = lines.map(({ text, ending }) => `${text}${ending}`).join('');
        const lineIndex = lineChoice % lines.length;
        const lineText = lines[lineIndex]?.text ?? '';
        const column = columnChoice % (lineText.length + 1);
        const document = openDocumentBytes(new TextEncoder().encode(original));
        const { editor: opened, view } = openInEditor(document.text);

        opened.setEditingMode('richText');
        view.dispatch({
          changes: { from: view.state.doc.line(lineIndex + 1).from + column, insert: 'word' },
        });
        const saved = new TextDecoder().decode(savedDocumentBytes(opened.text(), document));
        closeEditor();

        const expected = lines
          .map(({ text, ending }, index) => {
            const edited = index === lineIndex ? `${text.slice(0, column)}word${text.slice(column)}` : text;
            return `${edited}${ending}`;
          })
          .join('');
        expect(saved).toBe(expected);
      }),
    );
  });
});
