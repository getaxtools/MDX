import { EditorView } from '@codemirror/view';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormulaField, type FormulaField, type FormulaFieldOptions } from '../formulas/formulaField';
import { measureTextAsEmpty, pasteInto } from './pasteTestEvents';

let field: FormulaField | undefined;

function openField(options: Partial<FormulaFieldOptions> = {}): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  field = createFormulaField({
    parent,
    text: '',
    label: 'Source',
    describedBy: '',
    onChange: vi.fn(),
    onInsert: vi.fn(),
    isEnterInserting: () => false,
    ...options,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The field was not created');
  return view;
}

let restoreTextMeasuring: () => void;

// The MathML converter is a chunk of its own, loaded on first use; under a busy machine that first
// load alone can outlast a wait, so it is loaded once here and the tests time only the paste.
beforeAll(async () => {
  restoreTextMeasuring = measureTextAsEmpty();
  await import('mathml-to-latex');
});

afterAll(() => {
  restoreTextMeasuring();
});

afterEach(() => {
  field?.destroy();
  field = undefined;
  document.body.replaceChildren();
});

describe('pasting into the equation field', () => {
  it('pasting into the equation field gives TeX without delimiters', async () => {
    const view = openField();

    pasteInto(view, { 'text/plain': '\\(a+b\\)' });

    await vi.waitFor(() => expect(field?.text()).toBe('a+b'));
  });

  it('a web page formula gives its TeX without the display-style wrapper', async () => {
    const view = openField();
    const html =
      '<math display="block"><annotation encoding="application/x-tex">{\\displaystyle x^{2}}</annotation></math>';

    pasteInto(view, { 'text/plain': 'x2', 'text/html': html });

    await vi.waitFor(() => expect(field?.text()).toBe('x^{2}'));
  });

  it('MathML gives its converted TeX', async () => {
    const view = openField();

    pasteInto(view, { 'text/plain': '<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>' });

    await vi.waitFor(() => expect(field?.text()).toBe('\\frac{x}{2}'));
  });

  it('a formula that does not typeset pastes as its plain text', async () => {
    const isFormulaTypeset = vi.fn(() => Promise.resolve(false));
    const view = openField({ isFormulaTypeset });

    pasteInto(view, { 'text/plain': '\\(\\frac{1\\)' });

    await vi.waitFor(() => expect(field?.text()).toBe('\\(\\frac{1\\)'));
    expect(isFormulaTypeset).toHaveBeenCalledWith('\\frac{1', false);
  });

  it('a field typed in while the conversion loads keeps what was typed', async () => {
    let finishCheck: (isTypeset: boolean) => void = () => undefined;
    const isFormulaTypeset = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishCheck = resolve;
        }),
    );
    const view = openField({ isFormulaTypeset });
    pasteInto(view, { 'text/plain': '\\(a+b\\)' });
    await vi.waitFor(() => expect(isFormulaTypeset).toHaveBeenCalledOnce());

    view.dispatch(view.state.replaceSelection('typed'));
    finishCheck(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(field?.text()).toBe('typed');
  });

  it('text around the formula leaves the paste as usual', () => {
    const view = openField();

    pasteInto(view, { 'text/plain': 'Energy \\(E\\) and \\(m\\)' });

    expect(field?.text()).toBe('Energy \\(E\\) and \\(m\\)');
  });
});
