import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { wikiLinkCompletions, type WikiLinkNote, type WikiLinkSuggester } from './wikiLinkCompletions';
import { markdownSyntax } from '../syntax/markdownSyntax';

const NOTES: readonly WikiLinkNote[] = [
  { name: 'Plan', target: 'Plan', folder: '', alias: null },
  { name: 'Planning', target: 'Projects/Planning', folder: 'Projects', alias: null },
  { name: 'Roadmap', target: 'Roadmap', folder: '', alias: 'Q3 plan' },
];

/** Notes by prefix of their name or alias, and the headings of Plan; it records what was asked. */
function suggester(): WikiLinkSuggester & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    notes: (typed) => {
      asked.push(`notes:${typed}`);
      const wanted = typed.toLowerCase();
      return Promise.resolve(
        NOTES.filter((note) => (note.alias ?? note.name).toLowerCase().startsWith(wanted)),
      );
    },
    headings: (target) => {
      asked.push(`headings:${target}`);
      return Promise.resolve([
        { level: 1, text: 'Plan' },
        { level: 2, text: 'Goals' },
        { level: 2, text: 'Budget' },
      ]);
    },
  };
}

/** The caret goes where `|` is. */
function viewWithCaret(textWithCaret: string): EditorView {
  const caret = textWithCaret.indexOf('|');
  return new EditorView({
    state: EditorState.create({
      doc: textWithCaret.slice(0, caret) + textWithCaret.slice(caret + 1),
      selection: EditorSelection.cursor(caret),
      extensions: [markdownSyntax()],
    }),
  });
}

async function completionsAt(view: EditorView, source = suggester()): Promise<CompletionResult | null> {
  return wikiLinkCompletions(source)(
    new CompletionContext(view.state, view.state.selection.main.head, false, view),
  );
}

async function labelsAt(textWithCaret: string, source = suggester()): Promise<string[] | undefined> {
  const result = await completionsAt(viewWithCaret(textWithCaret), source);
  return result?.options.map((option) => option.label);
}

/** Chooses the option with that label and shows the caret as `|` in the result. */
async function chosen(textWithCaret: string, label: string): Promise<string> {
  const view = viewWithCaret(textWithCaret);
  const result = await completionsAt(view);
  const option = result?.options.find((candidate) => candidate.label === label);
  if (!result || !option || typeof option.apply !== 'function') throw new Error(`No option ${label}`);
  option.apply(view, option, result.from, result.to ?? result.from);
  const head = view.state.selection.main.head;
  return `${view.state.sliceDoc(0, head)}|${view.state.sliceDoc(head)}`;
}

describe('wiki-link suggestions', () => {
  it('suggestions narrow while typing', async () => {
    const source = suggester();

    expect(await labelsAt('See [[pl|', source)).toEqual(['Plan', 'Planning']);
    expect(await labelsAt('See [[plann|', source)).toEqual(['Planning']);
    expect(source.asked).toEqual(['notes:pl', 'notes:plann']);
  });

  it('a note found by an alias shows its name and folder beside it', async () => {
    const result = await completionsAt(viewWithCaret('[[q3|'));

    expect(result?.options).toEqual([expect.objectContaining({ label: 'Q3 plan', detail: 'Roadmap' })]);
    const planning = (await completionsAt(viewWithCaret('[[planni|')))?.options[0];
    expect(planning).toEqual(expect.objectContaining({ label: 'Planning', info: 'Projects' }));
  });

  it('choosing a note inserts its target and closes the brackets', async () => {
    expect(await chosen('See [[planni|', 'Planning')).toBe('See [[Projects/Planning]]|');
  });

  it('choosing a note uses brackets already closed for it', async () => {
    expect(await chosen('See [[pl|]] today', 'Plan')).toBe('See [[Plan]]| today');
  });

  it('choosing an alias keeps it as the text of the link', async () => {
    expect(await chosen('[[q3|', 'Q3 plan')).toBe('[[Roadmap|Q3 plan]]|');
  });

  it('choosing a heading inserts it and closes the brackets', async () => {
    expect(await chosen('See [[Plan#go|]]', 'Goals')).toBe('See [[Plan#Goals]]|');
    expect(await chosen('See [[Plan#bu|', 'Budget')).toBe('See [[Plan#Budget]]|');
  });

  it('headings narrow while typing and come from the note named before #', async () => {
    const source = suggester();

    expect(await labelsAt('[[Plan#|', source)).toEqual(['Plan', 'Goals', 'Budget']);
    expect(await labelsAt('[[Plan#oa|', source)).toEqual(['Goals']);
    expect(source.asked).toEqual(['headings:Plan', 'headings:Plan']);
  });

  it('an empty target offers the headings of the note being edited', async () => {
    const source = suggester();

    await labelsAt('[[#|', source);

    expect(source.asked).toEqual(['headings:']);
  });

  it('nothing happens during IME composition', async () => {
    const view = viewWithCaret('[[pl|');
    const source = suggester();
    const composingView = new Proxy(view, {
      get: (target, property): unknown =>
        property === 'composing' ? true : (Reflect.get(target, property) as unknown),
    });

    const result = await wikiLinkCompletions(source)(
      new CompletionContext(view.state, view.state.selection.main.head, false, composingView),
    );

    expect(result).toBeNull();
    expect(source.asked).toEqual([]);
  });

  it.each([
    ['inline code', 'Use `[[pl|` here'],
    ['a code block', '```\n[[pl|\n```'],
    ['a single bracket', 'See [pl|'],
    ['a finished link', 'See [[Plan]] and pl|'],
  ])('nothing is offered in %s', async (_place, textWithCaret) => {
    const source = suggester();

    expect(await labelsAt(textWithCaret, source)).toBeUndefined();
    expect(source.asked).toEqual([]);
  });
});
