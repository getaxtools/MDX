import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { blockAt, frontMatterEndOf, siblingBlocksAt } from './markdownBlocks';

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

function blockTextAt(doc: string, search: string): string | undefined {
  const state = stateOf(doc);
  const block = blockAt(state, doc.indexOf(search));
  return block ? doc.slice(block.from, block.to) : undefined;
}

describe('markdown blocks', () => {
  it('a paragraph is one block of whole lines', () => {
    const doc = '# Title\n\nFirst line\nsecond line\n\nNext';

    expect(blockTextAt(doc, 'second')).toBe('First line\nsecond line');
    expect(blockAt(stateOf(doc), doc.indexOf('second'))?.kind).toBe('paragraph');
  });

  it('a list item includes its nested items', () => {
    const doc = '- one\n  - one a\n  - one b\n- two\n';

    expect(blockTextAt(doc, 'one\n')).toBe('- one\n  - one a\n  - one b');
  });

  it('a nested item has the items of its own list as siblings', () => {
    const doc = '- one\n  - one a\n  - one b\n- two\n';
    const siblings = siblingBlocksAt(stateOf(doc), doc.indexOf('one b'));

    expect(siblings?.blocks.map((block) => doc.slice(block.from, block.to))).toEqual([
      '  - one a',
      '  - one b',
    ]);
    expect(siblings?.index).toBe(1);
  });

  it('a list at the top level is one block among paragraphs', () => {
    const doc = 'Intro\n\n- one\n- two\n\nOutro';
    const siblings = siblingBlocksAt(stateOf(doc), doc.indexOf('Intro'));

    expect(siblings?.blocks.map((block) => block.kind)).toEqual(['paragraph', 'list', 'paragraph']);
  });

  it('a fenced block is one block', () => {
    const doc = 'Before\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n';

    expect(blockTextAt(doc, 'const b')).toBe('```js\nconst a = 1;\n\nconst b = 2;\n```');
  });

  it('a table is one block', () => {
    const doc = '| A | B |\n|---|---|\n| 1 | 2 |\n\nAfter';

    expect(blockAt(stateOf(doc), doc.indexOf('1 |'))).toEqual({ kind: 'table', from: 0, to: 29 });
  });

  it('display math is a math block', () => {
    const doc = 'Text\n\n$$\nx^2\n$$\n';

    expect(blockAt(stateOf(doc), doc.indexOf('x^2'))?.kind).toBe('mathBlock');
  });

  it('front matter is never a block', () => {
    const doc = '---\ntitle: Guide\n---\n\n# Guide\n';
    const state = stateOf(doc);

    expect(frontMatterEndOf(state.doc)).toBe(20);
    expect(blockAt(state, doc.indexOf('title'))).toBeUndefined();
    expect(siblingBlocksAt(state, doc.indexOf('# Guide'))?.blocks).toEqual([
      { kind: 'heading', from: 22, to: 29 },
    ]);
  });

  it('refuses the lookup when the syntax tree is not available', () => {
    const state = EditorState.create({ doc: 'Plain text' });

    expect(blockAt(state, 0)).toBeUndefined();
  });
});
