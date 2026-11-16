import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EDITOR_ACTION_COMMANDS } from '../editorActionCommands';
import type { EditorAction } from '../editorShortcuts';
import { BUILT_IN_SLASH_ITEMS } from '../slash-menu/slashMenuItems';
import { markdownSyntax } from '../syntax/markdownSyntax';

function stateOf(doc: string, anchor: number, head = anchor): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdownSyntax()],
  });
  ensureSyntaxTree(state, doc.length, 1000);
  return state;
}

function textAfter(action: EditorAction, doc: string, selection: { anchor: number; head?: number }): string {
  const view = new EditorView({ state: stateOf(doc, selection.anchor, selection.head) });
  EDITOR_ACTION_COMMANDS[action](view);
  const text = view.state.doc.toString();
  view.destroy();
  return text;
}

/** The toolbox commands that start a block, with the insert menu item that starts the same block. */
const INSERT_PAIRS: readonly (readonly [EditorAction, string])[] = [
  ['heading1', 'heading1'],
  ['heading2', 'heading2'],
  ['heading3', 'heading3'],
  ['bulletList', 'bulletList'],
  ['numberedList', 'numberedList'],
  ['taskList', 'taskList'],
  ['quote', 'quote'],
  ['codeBlock', 'codeBlock'],
  ['horizontalRule', 'horizontalRule'],
];

/** Commands that change only the lines they are about, never adding or removing lines. */
const LINE_KEEPING_ACTIONS: readonly EditorAction[] = [
  'bold',
  'italic',
  'strikethrough',
  'inlineCode',
  'heading2',
  'bulletList',
  'numberedList',
  'taskList',
  'quote',
];

describe("formatting in the document's own style", () => {
  it('italic uses underscores in a document that does', () => {
    const doc = 'Some _old_ text.\n\nNew word';

    expect(textAfter('italic', doc, { anchor: doc.indexOf('word'), head: doc.length })).toBe(
      'Some _old_ text.\n\nNew _word_',
    );
  });

  it("bullet list uses the document's marker", () => {
    const doc = '* one\n* two\n\nthree';

    expect(textAfter('bulletList', doc, { anchor: doc.length })).toBe('* one\n* two\n\n* three');
  });

  it("numbered list uses the document's delimiter", () => {
    const doc = '1) one\n2) two\n\nthree';

    expect(textAfter('numberedList', doc, { anchor: doc.length })).toBe('1) one\n2) two\n\n1) three');
  });

  it('Ctrl+B inside bold text removes the markers', () => {
    const doc = 'A **bold** word';

    expect(textAfter('bold', doc, { anchor: doc.indexOf('ol') })).toBe('A bold word');
    expect(
      textAfter('bold', '__strong__ and x', {
        anchor: '__strong__ and '.length,
        head: '__strong__ and x'.length,
      }),
    ).toBe('__strong__ and __x__');
  });

  it('each insert menu item and its toolbox command insert the same text', () => {
    for (const [action, itemId] of INSERT_PAIRS) {
      const item = BUILT_IN_SLASH_ITEMS.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error(`No insert menu item ${itemId}`);
      const slashState = stateOf('/', 1);
      const fromMenu = slashState.update(item.insert(slashState, { from: 0, to: 1 })).state.doc.toString();

      expect(textAfter(action, '', { anchor: 0 }), action).toBe(fromMenu);
    }
  });

  it('a formatting command changes only the selected lines', () => {
    const line = fc.constantFrom(
      'plain text',
      '**bold** words',
      '- item',
      '1. step',
      '> quoted',
      '## Title',
      '',
    );
    const document = fc.array(line, { minLength: 3, maxLength: 10 });

    fc.assert(
      fc.property(
        fc.record({
          lines: document,
          a: fc.nat(),
          b: fc.nat(),
          action: fc.constantFrom(...LINE_KEEPING_ACTIONS),
        }),
        ({ lines, a, b, action }) => {
          const first = a % lines.length;
          const last = first + (b % (lines.length - first));
          const doc = lines.join('\n');
          const state = stateOf(doc, 0);
          const from = state.doc.line(first + 1).from;
          const to = state.doc.line(last + 1).to;

          const after = textAfter(action, doc, { anchor: from, head: to }).split('\n');

          expect(after.slice(0, first)).toEqual(lines.slice(0, first));
          expect(after.slice(last + 1)).toEqual(lines.slice(last + 1));
        },
      ),
    );
  });
});
