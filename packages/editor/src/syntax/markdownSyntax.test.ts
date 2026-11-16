import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';
import { markdownHighlightStyle } from '../editorTheme';
import { markdownSyntax } from './markdownSyntax';

let editor: SourceEditor | undefined;

function nodeNamesOf(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdownSyntax()] });
  const names: string[] = [];
  ensureSyntaxTree(state, doc.length, 1000)?.iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

describe('the editor Markdown syntax', () => {
  afterEach(() => {
    editor?.destroy();
    document.body.innerHTML = '';
  });

  it('tables, task markers and strikethrough are in the syntax tree', () => {
    const names = nodeNamesOf('| A | B |\n|---|---|\n| 1 | 2 |\n\n- [ ] Pay rent\n\nThis is ~~gone~~.\n');

    expect(names).toEqual(
      expect.arrayContaining(['Table', 'TableRow', 'Task', 'TaskMarker', 'Strikethrough']),
    );
  });

  it('strikethrough text gets the strikethrough style', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    editor = createSourceEditor({
      parent,
      text: 'This is ~~gone~~.',
      label: 'Source',
      phrases: {},
      onChange: vi.fn(),
    });
    const strikethroughClass = markdownHighlightStyle.style([tags.strikethrough]) ?? 'missing';

    const styled = [...parent.querySelectorAll(`.${strikethroughClass}`)].map(
      (element) => element.textContent,
    );

    expect(styled.join('')).toContain('gone');
  });

  it('a pipe line without a delimiter row is not a table', () => {
    const names = nodeNamesOf('| A | B |\n| 1 | 2 |\n');

    expect(names).not.toContain('Table');
    expect(names).toContain('Paragraph');
  });
});
