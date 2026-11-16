import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownSyntax } from '../syntax/markdownSyntax';
import { formattingStateOf } from './formattingState';

function stateAt(doc: string, anchor: number, head = anchor): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdownSyntax()],
  });
  ensureSyntaxTree(state, doc.length, 1000);
  return state;
}

describe('the formatting at the selection', () => {
  it('Bold pressed inside strong text', () => {
    const doc = 'A **plan** here';

    const formatting = formattingStateOf(stateAt(doc, doc.indexOf('la')));

    expect(formatting.pressed).toEqual(['bold']);
  });

  it('heading menu names Heading 2 on a level 2 heading', () => {
    expect(formattingStateOf(stateAt('## Results\n\nText', 4)).headingLevel).toBe(2);
    expect(formattingStateOf(stateAt('## Results\n\nText', 13)).headingLevel).toBe(0);
  });

  it('a selection over mixed formatting shows not pressed', () => {
    const doc = 'Plain and **bold** text';

    expect(formattingStateOf(stateAt(doc, 0, doc.indexOf('ld'))).pressed).toEqual([]);
  });

  it('lists, tasks, quotes and links are pressed at the caret', () => {
    const doc = '- one\n\n1. two\n\n- [ ] three\n\n> four with [a link](a.md)';

    expect(formattingStateOf(stateAt(doc, 3)).pressed).toEqual(['bulletList']);
    expect(formattingStateOf(stateAt(doc, doc.indexOf('two'))).pressed).toEqual(['numberedList']);
    expect(formattingStateOf(stateAt(doc, doc.indexOf('three'))).pressed).toEqual(['taskList']);
    expect(formattingStateOf(stateAt(doc, doc.indexOf('link'))).pressed).toEqual(['link', 'quote']);
  });
});
