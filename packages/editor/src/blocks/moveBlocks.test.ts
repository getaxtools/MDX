import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { documentFixtures } from '../byte-exact/documentFixtures';
import { openDocumentBytes, savedDocumentBytes } from '../byte-exact/documentBytes';
import { blockMove, moveAnnouncement, moveBlockCommand, type MoveDirection } from './moveBlocks';
import type { EditorView } from '@codemirror/view';
import { siblingBlocksAt } from './markdownBlocks';
import { markdownSyntax } from '../syntax/markdownSyntax';

function stateOf(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdownSyntax()],
  });
}

function moved(state: EditorState, direction: MoveDirection): EditorState {
  const move = blockMove(state, direction);
  if (move?.outcome !== 'moved') return state;
  return state.update(move.spec).state;
}

describe('blockMove', () => {
  it('paragraph moves down past the next block, keeping the blank line between', () => {
    const doc = 'First\n\nSecond\n\nThird\n';

    const state = moved(stateOf(doc, 0), 'down');

    expect(state.doc.toString()).toBe('Second\n\nFirst\n\nThird\n');
    expect(state.doc.sliceString(state.selection.main.from, state.selection.main.from + 5)).toBe('First');
  });

  it('list item moves within its list only', () => {
    const doc = 'Intro\n\n- one\n- two\n\nOutro';

    const down = moved(stateOf(doc, doc.indexOf('two')), 'down');
    const up = moved(stateOf(doc, doc.indexOf('one')), 'up');

    expect(blockMove(stateOf(doc, doc.indexOf('two')), 'down')).toEqual({
      outcome: 'atEdge',
      direction: 'down',
    });
    expect(down.doc.toString()).toBe(doc);
    expect(up.doc.toString()).toBe(doc);
    expect(moved(stateOf(doc, doc.indexOf('one')), 'down').doc.toString()).toBe(
      'Intro\n\n- two\n- one\n\nOutro',
    );
  });

  it('selection over two blocks moves both', () => {
    const doc = 'A\n\nB\n\nC\n';

    const state = moved(stateOf(doc, 0, doc.indexOf('B')), 'down');

    expect(state.doc.toString()).toBe('C\n\nA\n\nB\n');
  });

  it('first block up changes nothing and says it is the first', () => {
    const state = stateOf('A\n\nB', 0);

    const move = blockMove(state, 'up');

    expect(move).toEqual({ outcome: 'atEdge', direction: 'up' });
    expect(move && moveAnnouncement(state, move)).toBe('This is the first block.');
  });

  it('a last block without a final line break keeps the file without one', () => {
    const doc = 'A\n\nB';

    expect(moved(stateOf(doc, 0), 'down').doc.toString()).toBe('B\n\nA');
  });

  it('message names block kind and direction', () => {
    const state = stateOf('# Title\n\nText', 0);
    const move = blockMove(state, 'down');

    expect(move && moveAnnouncement(state, move)).toBe('Moved heading down.');
  });

  it('moving any block up then down restores the bytes, in every fixture document', () => {
    const fixtures = documentFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      for (const blockStart of blockStartsAfterTheFirst(fixture.bytes)) {
        expect(
          [...bytesAfterMovingUpAndDown(fixture.bytes, blockStart)],
          `${fixture.name} at ${String(blockStart)}`,
        ).toEqual([...fixture.bytes]);
      }
    }
  });

  it('move is ignored while composing', () => {
    const state = stateOf('A\n\nB', 0);
    const dispatched: unknown[] = [];
    const composingView = { composing: true, state, dispatch: (spec: unknown) => dispatched.push(spec) };

    const isHandled = moveBlockCommand('down')(composingView as unknown as EditorView);

    expect(isHandled).toBe(false);
    expect(dispatched).toEqual([]);
  });
});

function blockStartsAfterTheFirst(bytes: Uint8Array): number[] {
  const text = editorTextOf(bytes);
  const blocks = siblingBlocksAt(stateOf(text, text.length), text.length)?.blocks ?? [];
  return blocks.slice(1).map((block) => block.from);
}

/** Moves the block at a position up and, when it moved, down again; the first item of a list cannot move up. */
function bytesAfterMovingUpAndDown(bytes: Uint8Array, blockStart: number): Uint8Array {
  const opened = openDocumentBytes(bytes);
  const state = stateOf(editorTextOf(bytes), blockStart);
  const up = moved(state, 'up');
  const back = up === state ? state : moved(up, 'down');
  return savedDocumentBytes(back.doc.toString(), opened);
}

/** The text as the editor holds it, with every line break as `\n`. */
function editorTextOf(bytes: Uint8Array): string {
  return EditorState.create({ doc: openDocumentBytes(bytes).text }).doc.toString();
}
