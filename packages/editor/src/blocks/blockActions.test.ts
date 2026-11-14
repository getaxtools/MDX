import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { blockAction, type BlockAction } from './blockActions';

function applied(doc: string, caret: number, action: BlockAction): string {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(caret),
    extensions: [markdown({ base: markdownLanguage })],
  });
  const spec = blockAction(state, action);
  return spec ? state.update(spec).state.doc.toString() : doc;
}

describe('block actions', () => {
  it('Duplicate inserts an exact copy below', () => {
    expect(applied('First line\nsecond\n\nNext', 0, 'duplicate')).toBe(
      'First line\nsecond\n\nFirst line\nsecond\n\nNext',
    );
  });

  it('duplicates a list item inside its list', () => {
    expect(applied('- one\n- two', 2, 'duplicate')).toBe('- one\n- one\n- two');
  });

  it('Delete removes the block and the blank lines after it', () => {
    expect(applied('A\n\nB\n\nC', 3, 'delete')).toBe('A\n\nC');
    expect(applied('A\n\nB', 3, 'delete')).toBe('A');
  });

  it('Turn into quote prefixes every line', () => {
    expect(applied('First\nsecond', 0, 'turnInto.quote')).toBe('> First\n> second');
  });

  it('turns a heading into a paragraph and a quote into a bulleted list', () => {
    expect(applied('## Title', 0, 'turnInto.paragraph')).toBe('Title');
    expect(applied('> a\n> b', 0, 'turnInto.bulletList')).toBe('- a\n- b');
  });

  it('turns a paragraph into a code block', () => {
    expect(applied('let a = 1', 0, 'turnInto.codeBlock')).toBe('```\nlet a = 1\n```');
  });

  it('moves the block from the menu', () => {
    expect(applied('A\n\nB', 0, 'moveDown')).toBe('B\n\nA');
  });
});
