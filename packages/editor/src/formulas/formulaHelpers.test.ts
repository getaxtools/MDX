import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormulaField, type FormulaField, type FormulaFieldOptions } from './formulaField';
import { matchingCommands, type TexCommand } from './formulaSuggestions';

const COMMANDS: readonly TexCommand[] = [
  { name: 'Frac', argumentCount: 0 },
  { name: 'alpha', argumentCount: 0 },
  { name: 'frac', argumentCount: 2 },
  { name: 'frak', argumentCount: 1 },
  { name: 'frown', argumentCount: 0 },
];

let field: FormulaField | undefined;

function openField(text: string, options: Partial<FormulaFieldOptions> = {}) {
  const parent = document.createElement('div');
  document.body.append(parent);
  field = createFormulaField({
    parent,
    text,
    label: 'TeX source',
    describedBy: 'hint',
    onChange: vi.fn(),
    onInsert: vi.fn(),
    isEnterInserting: () => false,
    ...options,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The field was not created');
  return view;
}

/** Types as an input method or keyboard does, so input handlers such as bracket pairing run. */
function type(view: EditorView, text: string): void {
  for (const character of text) {
    const { from, to } = view.state.selection.main;
    const insert = () =>
      view.state.update({ changes: { from, to, insert: character }, selection: { anchor: from + 1 } });
    const isHandled = view.state
      .facet(EditorView.inputHandler)
      .some((handler) => handler(view, from, to, character, insert));
    if (!isHandled) view.dispatch(insert());
  }
}

function pressTab(view: EditorView, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...init });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

function selected(view: EditorView): { from: number; to: number } {
  const { from, to } = view.state.selection.main;
  return { from, to };
}

describe('equation helpers', () => {
  afterEach(() => {
    field?.destroy();
    field = undefined;
    document.body.replaceChildren();
  });

  it('a backslash and fr suggest frac first', async () => {
    const view = openField('', {
      suggestions: { commands: COMMANDS, typeset: () => Promise.resolve('<span>typeset</span>') },
    });

    type(view, '\\fr');
    startCompletion(view);

    await vi.waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
    expect(currentCompletions(view.state).map((suggestion) => suggestion.label)).toEqual([
      '\\frac',
      '\\frak',
      '\\frown',
      '\\Frac',
    ]);
  });

  it('a suggestion has a name and a typeset preview that is only seen', async () => {
    const view = openField('', {
      suggestions: {
        commands: COMMANDS,
        typeset: (tex) => Promise.resolve(`<span class="typeset">${tex}</span>`),
      },
    });

    type(view, '\\fra');
    startCompletion(view);

    const option = await vi.waitFor(() => {
      const found = document.querySelector('[role="option"]');
      return found ?? Promise.reject(new Error('No suggestion shown'));
    });
    await vi.waitFor(() => expect(option.querySelector('.typeset')?.textContent).toBe('\\frac{a}{b}'));
    expect(option.querySelector('.cm-completionLabel')?.textContent).toBe('\\frac');
    expect(option.querySelector('.cm-formula-suggestion-preview')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('matching commands put those that match the case first', () => {
    expect(matchingCommands(COMMANDS, 'Fr').map(({ name }) => name)).toEqual([
      'Frac',
      'frac',
      'frak',
      'frown',
    ]);
  });

  it('frac then Tab gives two placeholders', () => {
    const view = openField('frac');

    pressTab(view);
    const first = selected(view);
    pressTab(view);
    const second = selected(view);

    expect(view.state.doc.toString()).toBe('\\frac{}{}');
    expect(first).toEqual({ from: 6, to: 6 });
    expect(second).toEqual({ from: 8, to: 8 });
  });

  it('Tab after the last placeholder leaves the field', () => {
    const view = openField('sqrt');
    pressTab(view);

    const isKeptInTheField = pressTab(view);

    expect(view.state.doc.toString()).toBe('\\sqrt{}');
    expect(isKeptInTheField).toBe(false);
  });

  it('Shift+Tab goes back to the placeholder before', () => {
    const view = openField('sum');
    pressTab(view);
    pressTab(view);

    pressTab(view, { shiftKey: true });

    expect(selected(view)).toEqual({ from: 6, to: 6 });
  });

  it('a word that names no snippet, or a command, is left as it is', () => {
    const view = openField('\\frac');

    const isKeptInTheField = pressTab(view);

    expect(view.state.doc.toString()).toBe('\\frac');
    expect(isKeptInTheField).toBe(false);
  });

  it('brackets are paired', () => {
    const view = openField('');

    type(view, 'x^{');

    expect(view.state.doc.toString()).toBe('x^{}');
  });

  it('automatic fraction is off by default', () => {
    const view = openField('');

    type(view, 'a/b');

    expect(view.state.doc.toString()).toBe('a/b');
  });

  it('a/b becomes a fraction when it is on', () => {
    const view = openField('', { isAutomaticFractionOn: () => true });

    type(view, 'a/b');

    expect(view.state.doc.toString()).toBe('\\frac{a}{b}');
  });

  it('a template selects its first placeholder', () => {
    const view = openField('');

    field?.insertTemplate('x = \\frac{-#{b} \\pm \\sqrt{#{b}^2 - 4#{a}#{c}}}{2#{a}}');

    expect(view.state.doc.toString()).toBe('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
    expect(selected(view)).toEqual({ from: 11, to: 12 });
  });
});
