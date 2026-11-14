import { CompletionContext } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { slashCompletions, type SlashMenuProvider } from './slashMenu';
import { BUILT_IN_SLASH_ITEMS, type SlashMenuItem } from './slashMenuItems';

/** The caret goes where `|` is. */
function stateWithCaret(textWithCaret: string): EditorState {
  const caret = textWithCaret.indexOf('|');
  return EditorState.create({
    doc: textWithCaret.slice(0, caret) + textWithCaret.slice(caret + 1),
    selection: EditorSelection.cursor(caret),
    extensions: [markdown({ base: markdownLanguage })],
  });
}

function labelsFor(
  textWithCaret: string,
  providers: readonly SlashMenuProvider[] = [],
): string[] | undefined {
  const state = stateWithCaret(textWithCaret);
  const result = slashCompletions(new CompletionContext(state, state.selection.main.head, false), providers);
  return result?.options.map((option) => option.label);
}

function itemWithId(id: string): SlashMenuItem {
  const item = BUILT_IN_SLASH_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`No item ${id}`);
  return item;
}

/** Applies an item to the slash text before the caret and shows the caret as `|` in the result. */
function inserted(textWithCaret: string, id: string): string {
  const state = stateWithCaret(textWithCaret);
  const caret = state.selection.main.head;
  const slashStart = state.sliceDoc(0, caret).lastIndexOf('/');
  const after = state.update(itemWithId(id).insert(state, { from: slashStart, to: caret })).state;
  const head = after.selection.main.head;
  return `${after.sliceDoc(0, head)}|${after.sliceDoc(head)}`;
}

describe('slash menu', () => {
  it('opens at line start', () => {
    expect(labelsFor('/|')).toContain('Heading 1');
  });

  it('opens after a space', () => {
    expect(labelsFor('Some text /|')).toContain('Table');
  });

  it('not after a letter', () => {
    expect(labelsFor('docs/|')).toBeUndefined();
  });

  it.each([
    ['code', '```\n/|\n```'],
    ['inline code', 'Use `a /|` here'],
    ['math', 'Say $x /|$'],
    ['display math', '$$\n/|\n$$'],
    ['front matter', '---\ntitle: /|\n---\n'],
    ['HTML', '<div>\n/|\n</div>'],
    ['link targets', '[docs](<a /|>)'],
  ])('not in %s', (_place, text) => {
    expect(labelsFor(text)).toBeUndefined();
  });

  it('full-width solidus opens', () => {
    expect(labelsFor('／|')).toContain('Heading 1');
  });

  it('filters by name, putting the best match first', () => {
    expect(labelsFor('/tab|')?.[0]).toBe('Table');
    expect(labelsFor('/h2|')?.[0]).toBe('Heading 2');
  });

  it('finds an item by an English alias', () => {
    expect(labelsFor('/mermaid|')).toEqual(['Diagram']);
  });

  it('no match closes', () => {
    expect(labelsFor('/zzz|')).toBeUndefined();
  });

  it('kind items appear after built-ins in their group', () => {
    const notes: SlashMenuProvider = {
      section: 'Notes',
      items: () => [{ ...itemWithId('quote'), id: 'meeting', name: 'Meeting template', aliases: [] }],
    };
    const state = stateWithCaret('/|');
    const result = slashCompletions(new CompletionContext(state, 1, false), [notes]);
    const last = result?.options.at(-1);

    expect(last?.label).toBe('Meeting template');
    expect(typeof last?.section === 'object' ? last.section.name : last?.section).toBe('Notes');
  });

  it('provider errors leave built-ins working', () => {
    const failing: SlashMenuProvider = {
      section: 'Snippets',
      items: () => {
        throw new Error('broken');
      },
    };

    expect(labelsFor('/|', [failing])).toContain('Heading 1');
  });
});

describe('slash menu items', () => {
  it('heading replaces the slash text with its marker', () => {
    expect(inserted('/h2|', 'heading2')).toBe('## |');
  });

  it('list item follows the document marker', () => {
    expect(inserted('* one\n\n/|', 'bulletList')).toBe('* one\n\n* |');
    expect(inserted('/|', 'bulletList')).toBe('- |');
  });

  it('a block after text starts on the next line', () => {
    expect(inserted('Text /|', 'quote')).toBe('Text \n> |');
  });

  it('table has a header row and two empty rows of three columns with the caret in the first header cell', () => {
    expect(inserted('/tab|', 'table')).toBe('| | |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |');
  });

  it('code block puts the caret inside the fence', () => {
    expect(inserted('/code|', 'codeBlock')).toBe('```\n|\n```');
  });

  it('callout adds the NOTE marker with the caret in the body', () => {
    expect(inserted('/call|', 'callout')).toBe('> [!NOTE]\n> |');
  });

  it('inline math puts the caret between the dollar signs', () => {
    expect(inserted('Area /math|', 'inlineMath')).toBe('Area $|$');
  });

  it('undo restores the slash text', () => {
    const state = stateWithCaret('/h2|');
    const insertion = state.update(itemWithId('heading2').insert(state, { from: 0, to: 3 }), {
      userEvent: 'input.complete',
    });

    expect(insertion.startState.doc.toString()).toBe('/h2');
    expect(insertion.changes.invert(state.doc).apply(insertion.state.doc).toString()).toBe('/h2');
  });
});
