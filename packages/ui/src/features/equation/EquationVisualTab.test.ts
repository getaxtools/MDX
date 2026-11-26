import type { FormulaEditRequest } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import type { FormulaPreview } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EquationDialog from './EquationDialog.svelte';
import { stubWhatMathfieldsNeed } from './visual/mathfieldTestEnvironment';
import type { CreateVisualFormulaEditor, VisualFormulaEditorOptions } from './visual/visualFormulaEditor';

const REQUEST: FormulaEditRequest = {
  target: { from: 0, to: 0, original: '' },
  source: 'x^2',
  kind: 'inline',
  isExisting: false,
  editedLines: { top: 100, bottom: 124, left: 40 },
};

function typeset(tex: string): Promise<FormulaPreview> {
  return Promise.resolve({ kind: 'typeset', html: `<span class="typeset">${tex}</span>` });
}

/** A stand-in for the visual editor that records what the dialog asks of it. */
function fakeVisualEditor() {
  const shown = { setTex: vi.fn(), focus: vi.fn(), showKeyboard: vi.fn(), destroy: vi.fn() };
  let options: VisualFormulaEditorOptions | undefined;
  const create: CreateVisualFormulaEditor = (given) => {
    options = given;
    return Promise.resolve(shown);
  };
  return {
    shown,
    load: vi.fn(() => Promise.resolve(create)),
    editVisually: (tex: string) => options?.onChange(tex),
  };
}

function renderDialog(loadVisualEditor: () => Promise<CreateVisualFormulaEditor>) {
  render(EquationDialog, {
    request: REQUEST,
    lastKind: 'inline',
    isAutomaticFractionOn: false,
    translator: createTranslator(),
    previewFormula: typeset,
    onInsert: vi.fn(),
    onCancel: vi.fn(),
    onKindChange: vi.fn(),
    onAutomaticFractionChange: vi.fn(),
    loadVisualEditor,
  });
  return { source: screen.getByRole('textbox', { name: 'TeX source' }) };
}

const QUADRATIC = String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;

describe('the Visual tab', () => {
  beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [new DOMRect(0, 0, 1, 1)],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 1, 1),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    vi.restoreAllMocks();
  });

  it('the visual chunk is not loaded until the tab opens', async () => {
    const visual = fakeVisualEditor();
    renderDialog(visual.load);
    await userEvent.click(screen.getByRole('tab', { name: 'TeX' }));
    const loadsBeforeOpening = visual.load.mock.calls.length;

    await userEvent.click(screen.getByRole('tab', { name: 'Visual' }));

    expect(loadsBeforeOpening).toBe(0);
    await vi.waitFor(() => expect(visual.shown.focus).toHaveBeenCalledOnce());
    expect(visual.load).toHaveBeenCalledOnce();
    expect(screen.getByRole('tab', { name: 'Visual' }).getAttribute('aria-selected')).toBe('true');
  });

  it('an edit in either field updates the other once', async () => {
    const visual = fakeVisualEditor();
    const { source } = renderDialog(visual.load);
    await userEvent.click(screen.getByRole('tab', { name: 'Visual' }));
    await vi.waitFor(() => expect(visual.shown.focus).toHaveBeenCalled());
    visual.shown.setTex.mockClear();

    visual.editVisually('x^3');
    const callsAfterTheVisualEdit = visual.shown.setTex.mock.calls.length;
    const sourceAfterTheVisualEdit = source.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    const quadratic = await screen.findByRole('gridcell', { name: 'Quadratic formula' });
    quadratic.focus();
    await userEvent.keyboard('{Enter}');

    expect(callsAfterTheVisualEdit).toBe(0);
    expect(sourceAfterTheVisualEdit).toBe('x^3');
    expect(visual.shown.setTex.mock.calls).toEqual([[`x^3${QUADRATIC}`]]);
    await vi.waitFor(() =>
      expect(screen.getByRole('group', { name: 'Preview' }).textContent).toBe(`x^3${QUADRATIC}`),
    );
  });

  it('on-screen keyboard stays hidden until asked', async () => {
    const visual = fakeVisualEditor();
    renderDialog(visual.load);
    await userEvent.click(screen.getByRole('tab', { name: 'Visual' }));
    await vi.waitFor(() => expect(visual.shown.focus).toHaveBeenCalled());
    const isShownBeforeAsking = visual.shown.showKeyboard.mock.calls.length > 0;

    await userEvent.click(screen.getByRole('button', { name: 'Show keyboard' }));

    expect(isShownBeforeAsking).toBe(false);
    expect(visual.shown.showKeyboard).toHaveBeenCalledOnce();
  });

  it('the arrow keys move between the tabs', async () => {
    const visual = fakeVisualEditor();
    renderDialog(visual.load);
    screen.getByRole('tab', { name: 'TeX' }).focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Visual' }));
    expect(screen.getByRole('tab', { name: 'Visual' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a visual editor that cannot load says so and the TeX field still works', async () => {
    renderDialog(() => Promise.reject(new Error('The chunk did not load')));

    await userEvent.click(screen.getByRole('tab', { name: 'Visual' }));

    await vi.waitFor(() => expect(screen.getByText('The visual editor could not be loaded.')).toBeTruthy());
    await userEvent.click(screen.getByRole('tab', { name: 'TeX' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'TeX source' }));
  });
});

describe('the visual formula editor', () => {
  it('the visual editor never starts speech and keeps its keyboard hidden until asked', async () => {
    const restoreJsdom = stubWhatMathfieldsNeed();
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak });
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn());
    const { createVisualFormulaEditor } = await import('./visual/visualFormulaEditor');
    const parent = document.createElement('div');
    document.body.append(parent);
    const visual = await createVisualFormulaEditor({
      parent,
      tex: 'x^2',
      label: 'Visual',
      onChange: vi.fn(),
    });
    const field = parent.querySelector<HTMLElement & { executeCommand(command: unknown): boolean }>(
      'math-field',
    );

    visual.focus();
    field?.executeCommand(['speak', 'all', { withHighlighting: false }]);
    const isKeyboardShownAfterFocus = window.mathVirtualKeyboard.visible;
    visual.showKeyboard();

    expect(speak).not.toHaveBeenCalled();
    expect(isKeyboardShownAfterFocus).toBe(false);
    expect(window.mathVirtualKeyboard.visible).toBe(true);
    visual.destroy();
    parent.remove();
    restoreJsdom();
  });
});
