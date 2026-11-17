import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeRichTextRendering,
  openRichTextEditor,
  placeCaret,
  shownLines,
  type TestEditor,
} from './richTextTestEditor';

let opened: TestEditor | undefined;

function open(...args: Parameters<typeof openRichTextEditor>): TestEditor {
  opened = openRichTextEditor(...args);
  return opened;
}

function tableWithCells(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, index) => `| ${String(index)} | b | c |`);
  return ['| A | B | C |', '|---|---|---|', ...rows].join('\n');
}

function formulaNamed(editor: TestEditor, name: string): HTMLElement | undefined {
  return [...editor.view.contentDOM.querySelectorAll<HTMLElement>('[role="img"]')].find(
    (element) => element.getAttribute('aria-label') === name,
  );
}

describe('Rich text formulas', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('formula named Formula and its source', async () => {
    const editor = open('Inline $x^2$ here.\n\n$$\n\\frac{a}{b}\n$$\n\nEnd');

    await vi.waitFor(() => expect(editor.view.contentDOM.querySelectorAll('.typeset')).toHaveLength(2));

    expect(formulaNamed(editor, 'Formula x^2')?.tagName).toBe('SPAN');
    expect(formulaNamed(editor, 'Formula \\frac{a}{b}')?.tagName).toBe('DIV');
  });

  it('formula over 10,000 characters stays text', () => {
    const longTex = 'x'.repeat(10_001);

    const editor = open(`Inline $${longTex}$ here.\n\n$$\n${longTex}\n$$\n\nEnd`);

    expect(editor.view.contentDOM.querySelector('.cm-rich-formula')).toBeNull();
  });

  it('a typesetting error shows the source', async () => {
    const typesetMath = vi.fn(() => Promise.resolve(undefined));
    const editor = open('$$\n\\frac{1}{\n$$\n\nEnd', {
      richTextRendering: fakeRichTextRendering({ typesetMath }),
    });

    await vi.waitFor(() => expect(typesetMath).toHaveBeenCalled());
    await Promise.resolve();

    expect(editor.view.contentDOM.querySelector('.cm-rich-formula')?.textContent).toBe('$$\n\\frac{1}{\n$$');
  });

  it('the caret in a formula shows its source', () => {
    const editor = open('Inline $x^2$ here.\n\nEnd');

    placeCaret(editor.view, 'Inline $x'.length);

    expect(shownLines(editor.view)[0]).toBe('Inline $x^2$ here.');
  });
});

describe('Rich text tables and diagrams', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('table with 3,000 cells stays text', () => {
    const editor = open(`${tableWithCells(1_000)}\n\nEnd`);

    expect(editor.view.contentDOM.querySelector('.cm-rich-table')).toBeNull();
  });

  it('a table with a line over 10,000 characters stays text', () => {
    const editor = open(`| A |\n|---|\n| ${'x'.repeat(10_001)} |\n\nEnd`);

    expect(editor.view.contentDOM.querySelector('.cm-rich-table')).toBeNull();
  });

  it('diagram block without a drawing port shows as code', () => {
    const editor = open('```mermaid\ngraph TD; A-->B\n```\n\nEnd');

    expect(editor.view.contentDOM.querySelector('.cm-rich-diagram')).toBeNull();
    expect(shownLines(editor.view).slice(0, 3)).toEqual(['```mermaid', 'graph TD; A-->B', '```']);
  });

  it('a diagram the app can draw is drawn and named by its type', async () => {
    const drawDiagram = vi.fn(() => Promise.resolve('<svg class="drawn"></svg>'));
    const rendering = fakeRichTextRendering({ drawDiagram, canDrawDiagram: (type) => type === 'mermaid' });

    const editor = open('```mermaid\ngraph TD; A-->B\n```\n\nEnd', { richTextRendering: rendering });

    await vi.waitFor(() => expect(editor.view.contentDOM.querySelector('.drawn')).not.toBeNull());
    expect(drawDiagram).toHaveBeenCalledWith('mermaid', 'graph TD; A-->B');
    expect(editor.view.contentDOM.querySelector('.cm-rich-diagram')?.getAttribute('aria-label')).toBe(
      'Diagram, mermaid',
    );
  });
});

describe('Rich text front matter and callouts', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('Properties chip counts the properties', () => {
    const editor = open('---\ntitle: Plan\ntags:\n  - work\ndate: 2026-11-15\n---\n\nText');

    expect(editor.view.contentDOM.querySelector('.cm-rich-properties')?.textContent).toBe('3 properties');
  });

  it('caret in front matter shows its text', () => {
    const editor = open('---\ntitle: Plan\n---\n\nText');

    placeCaret(editor.view, 6);

    expect(editor.view.contentDOM.querySelector('.cm-rich-properties')).toBeNull();
    expect(shownLines(editor.view).slice(0, 3)).toEqual(['---', 'title: Plan', '---']);
  });

  it('tip callout shows its title away from the first line', () => {
    const editor = open('> [!TIP]\n> Use the shortcut.\n\nEnd');
    const lines = [...editor.view.contentDOM.querySelectorAll('.cm-line')].slice(0, 2);

    expect(lines.map((line) => line.textContent)).toEqual(['tip title', 'Use the shortcut.']);
    expect(lines.every((line) => line.classList.contains('cm-rich-callout-tip'))).toBe(true);
  });

  it('a callout shows its own title', () => {
    const editor = open('> [!NOTE] Read this first\n> Body\n\nEnd');

    expect(shownLines(editor.view)[0]).toBe('Read this first');
  });

  it('marker shows at the caret', () => {
    const editor = open('> [!TIP]\n> Use the shortcut.\n\nEnd');

    placeCaret(editor.view, 4);

    expect(shownLines(editor.view)[0]).toBe('[!TIP]');
    expect(editor.view.contentDOM.querySelector('.cm-line')?.classList.contains('cm-rich-callout-tip')).toBe(
      true,
    );
  });

  it('danger uses the caution look', () => {
    const editor = open('> [!danger]\n> Careful.\n\nEnd');

    expect(
      editor.view.contentDOM.querySelector('.cm-line')?.classList.contains('cm-rich-callout-caution'),
    ).toBe(true);
  });

  it('a quote with an unknown type stays a quote', () => {
    const editor = open('> [!mystery]\n> Text\n\nEnd');

    expect(shownLines(editor.view)[0]).toBe('[!mystery]');
    expect(editor.view.contentDOM.querySelector('.cm-rich-callout')).toBeNull();
  });
});
