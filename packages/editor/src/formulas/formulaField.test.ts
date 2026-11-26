import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormulaField, type FormulaField } from './formulaField';

let field: FormulaField | undefined;

function openField(text: string, { isInline = true } = {}) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onInsert = vi.fn();
  const onChange = vi.fn();
  field = createFormulaField({
    parent,
    text,
    label: 'TeX source',
    describedBy: 'hint',
    onChange,
    onInsert,
    isEnterInserting: () => isInline,
  });
  const content = parent.querySelector<HTMLElement>('.cm-content');
  if (!content) throw new Error('The field was not created');
  return { content, onInsert, onChange };
}

function pressEnter(content: HTMLElement, init: KeyboardEventInit = {}): void {
  content.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }),
  );
}

describe('formula field', () => {
  afterEach(() => {
    field?.destroy();
    field = undefined;
    document.body.replaceChildren();
  });

  it('is named and described for assistive technology', () => {
    const { content } = openField('x');

    expect(content.getAttribute('aria-label')).toBe('TeX source');
    expect(content.getAttribute('aria-describedby')).toBe('hint');
  });

  it('Enter inserts an inline formula', () => {
    const { content, onInsert } = openField('x^2');

    pressEnter(content);

    expect(onInsert).toHaveBeenCalledOnce();
    expect(field?.text()).toBe('x^2');
  });

  it('Enter starts a new line in a display formula', () => {
    const { content, onInsert } = openField('a', { isInline: false });

    pressEnter(content);

    expect(onInsert).not.toHaveBeenCalled();
    expect(field?.text()).toBe('a\n');
  });

  it('Enter that commits a composition does not insert', () => {
    const { content, onInsert } = openField('x');

    content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    pressEnter(content, { isComposing: true, keyCode: 229 });

    expect(onInsert).not.toHaveBeenCalled();
  });

  it('marks the character an error is at, and the last one for an error at the end', () => {
    const { content } = openField('\\frac{1}{');

    field?.markError(3);
    const marked = content.querySelector('.cm-formula-error')?.textContent;
    field?.markError(42);
    const markedAtEnd = content.querySelector('.cm-formula-error')?.textContent;
    field?.markError(undefined);

    expect(marked).toBe('a');
    expect(markedAtEnd).toBe('{');
    expect(content.querySelector('.cm-formula-error')).toBeNull();
  });
});
