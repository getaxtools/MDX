import { EditorSelection } from '@codemirror/state';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeRichTextRendering, openRichTextEditor, type TestEditor } from '../rich-text/richTextTestEditor';
import { MAX_CLIPBOARD_DEPTH, MAX_CLIPBOARD_ELEMENTS, MAX_CLIPBOARD_MARKUP_BYTES } from './clipboardHtml';
import { clipboardSamples, measureTextAsEmpty, pasteInto } from './pasteTestEvents';

let opened: TestEditor | undefined;

function open(text = '', options: Parameters<typeof openRichTextEditor>[1] = {}): TestEditor {
  opened = openRichTextEditor(text, options);
  return opened;
}

function documentText(editor: TestEditor): string {
  return editor.view.state.doc.toString();
}

/** Waits for the paste to finish: conversion and the typesetting check run after the event. */
async function pasted(editor: TestEditor, data: Readonly<Record<string, string>>): Promise<string> {
  const before = documentText(editor);
  pasteInto(editor.view, data);
  await vi.waitFor(() => expect(documentText(editor)).not.toBe(before));
  return documentText(editor);
}

function notice(editor: TestEditor): HTMLElement | null {
  return editor.view.dom.querySelector('.cm-formula-paste-notice');
}

const WEB_PAGE_FORMULA = [
  '<p><span class="mwe-math-element"><math display="block" alttext="{\\displaystyle x^{2}}">',
  '<semantics><msup><mi>x</mi><mn>2</mn></msup>',
  '<annotation encoding="application/x-tex">{\\displaystyle x^{2}}</annotation></semantics></math>',
  '<img src="https://wikimedia.org/api/rest_v1/media/math/render/svg/abc" alt="{\\displaystyle x^{2}}">',
  '</span></p>',
].join('');

let restoreTextMeasuring: () => void;

beforeAll(() => {
  restoreTextMeasuring = measureTextAsEmpty();
});

afterAll(() => {
  restoreTextMeasuring();
});

afterEach(() => {
  opened?.close();
  opened = undefined;
});

describe('pasting formulas', () => {
  it.each(clipboardSamples())('$name pastes as the expected Markdown', async (sample) => {
    const editor = open();

    pasteInto(editor.view, { 'text/plain': sample.text, 'text/html': sample.html });

    await vi.waitFor(() => expect(documentText(editor)).toBe(sample.expectedMarkdown));
  });

  it('currency stays text', async () => {
    const editor = open();

    expect(await pasted(editor, { 'text/plain': 'It costs $5 and $10.' })).toBe('It costs $5 and $10.');
  });

  it('escaped dollar stays', async () => {
    const editor = open();

    expect(await pasted(editor, { 'text/plain': 'Price \\$5 and \\(x\\)' })).toBe('Price \\$5 and $x$');
  });

  it('delimiters inside code stay', async () => {
    const editor = open();
    const text = ['Use `\\(y\\)` for \\(z\\).', '', '```', '\\(x\\)', '```'].join('\n');

    expect(await pasted(editor, { 'text/plain': text })).toBe(
      ['Use `\\(y\\)` for $z$.', '', '```', '\\(x\\)', '```'].join('\n'),
    );
  });

  it('displaystyle wrapper removed', async () => {
    const editor = open();

    expect(await pasted(editor, { 'text/plain': 'x^2', 'text/html': WEB_PAGE_FORMULA })).toBe(
      '$$\nx^{2}\n$$',
    );
  });

  it('display math goes on lines of its own in the middle of a line', async () => {
    const editor = open('Before after');
    editor.view.dispatch({ selection: EditorSelection.cursor('Before '.length) });

    expect(await pasted(editor, { 'text/plain': 'x^2', 'text/html': WEB_PAGE_FORMULA })).toBe(
      'Before \n$$\nx^{2}\n$$\nafter',
    );
  });

  it('picture files still go to the attachment folder', async () => {
    const onPastePicture = vi.fn(() => Promise.resolve('![chart](assets/chart.png)'));
    const editor = open('', { onPastePicture });
    const picture = new File([new Uint8Array([137, 80, 78, 71])], 'chart.png', { type: 'image/png' });

    pasteInto(editor.view, { 'text/plain': '\\(x\\)' }, [picture]);

    await vi.waitFor(() => expect(documentText(editor)).toBe('![chart](assets/chart.png)'));
    expect(onPastePicture).toHaveBeenCalledOnce();
  });

  it('HTML without formulas pastes its plain text', async () => {
    const editor = open();
    const html = '<h1>Title</h1><ul><li><b>One</b></li><li>Two</li></ul>';

    expect(await pasted(editor, { 'text/plain': 'Title\nOne\nTwo', 'text/html': html })).toBe(
      'Title\nOne\nTwo',
    );
  });

  it('without a typesetter the paste goes on as usual', async () => {
    const editor = open('', { hasRendering: false });

    expect(await pasted(editor, { 'text/plain': 'Energy \\(E\\)' })).toBe('Energy \\(E\\)');
  });
});

describe('pasting formulas safely', () => {
  it('an invalid formula pastes as text', async () => {
    const typesetMath = (tex: string) =>
      Promise.resolve(tex.includes('\\frac{') ? undefined : '<span></span>');
    const editor = open('', { richTextRendering: fakeRichTextRendering({ typesetMath }) });

    expect(await pasted(editor, { 'text/plain': 'Good \\(x\\), bad \\(\\frac{1\\)' })).toBe(
      'Good \\(x\\), bad \\(\\frac{1\\)',
    );
  });

  it('a document changed while the conversion loads gets the plain text where the paste was', async () => {
    let finishTypesetting: (html: string) => void = () => undefined;
    const typesetMath = () =>
      new Promise<string | undefined>((resolve) => {
        finishTypesetting = resolve;
      });
    const editor = open('Start ', { richTextRendering: fakeRichTextRendering({ typesetMath }) });
    pasteInto(editor.view, { 'text/plain': 'Area \\(x\\)' });

    editor.view.dispatch({ changes: { from: 0, insert: 'Typed ' }, selection: EditorSelection.cursor(6) });
    finishTypesetting('<span></span>');

    await vi.waitFor(() => expect(documentText(editor)).toBe('Typed Start Area \\(x\\)'));
    expect(notice(editor)).toBeNull();
  });

  it('dollars that would pair up with the text around the formula paste as text', async () => {
    const editor = open();

    expect(await pasted(editor, { 'text/plain': 'Costs $5 and \\(x\\)' })).toBe('Costs $5 and \\(x\\)');
  });

  it('HTML over 1 MB pastes as text', async () => {
    const editor = open();
    const formula = '<math alttext="x"><mi>x</mi></math>';
    const html = formula + '<p>a</p>'.repeat(MAX_CLIPBOARD_MARKUP_BYTES / 8 + 1);

    expect(await pasted(editor, { 'text/plain': 'plain x', 'text/html': html })).toBe('plain x');
  });

  it('deep nesting pastes as text', async () => {
    const editor = open();
    const depth = MAX_CLIPBOARD_DEPTH + 1;
    const html = `${'<span>'.repeat(depth)}<math alttext="x"><mi>x</mi></math>${'</span>'.repeat(depth)}`;

    expect(await pasted(editor, { 'text/plain': 'plain x', 'text/html': html })).toBe('plain x');
  });

  it('too many elements paste as text', async () => {
    const editor = open();
    const html = `<math alttext="x"><mi>x</mi></math>${'<b></b>'.repeat(MAX_CLIPBOARD_ELEMENTS)}`;

    expect(await pasted(editor, { 'text/plain': 'plain x', 'text/html': html })).toBe('plain x');
  });

  it('malformed MathML pastes as text', async () => {
    const editor = open();
    const notWellFormed = '<math><mfrac><mi>x</mi></math>';

    expect(await pasted(editor, { 'text/plain': notWellFormed })).toBe(notWellFormed);
    editor.view.dispatch({ changes: { from: 0, to: editor.view.state.doc.length } });
    const fractionWithOnePart = '<p><math><mfrac><mi>x</mi></mfrac></math></p>';
    expect(await pasted(editor, { 'text/plain': 'x', 'text/html': fractionWithOnePart })).toBe('x');
  });

  it("a formula's fallback image address is dropped", async () => {
    const editor = open();

    const markdown = await pasted(editor, { 'text/plain': 'x^2', 'text/html': WEB_PAGE_FORMULA });

    expect(markdown).not.toContain('wikimedia');
    expect(markdown).not.toContain('![');
  });
});

describe('the Pasted as equation notice', () => {
  function announcementsOf(editor: TestEditor): string[] {
    const region = editor.view.dom.querySelector('.cm-announced');
    const announcements: string[] = [];
    if (region) {
      new MutationObserver(() => announcements.push(region.textContent)).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    return announcements;
  }

  async function pastedFormula(editor: TestEditor): Promise<void> {
    await pasted(editor, { 'text/plain': 'Area \\(x\\)' });
  }

  it('notice announced once', async () => {
    const editor = open('Start ');
    const announcements = announcementsOf(editor);

    await pastedFormula(editor);
    editor.view.dispatch({ selection: EditorSelection.cursor(0) });
    await Promise.resolve();

    expect(notice(editor)?.textContent).toContain('Pasted as equation');
    expect(announcements).toEqual(['Pasted as equation']);
  });

  it('Paste as text restores the plain text', async () => {
    const editor = open('Start ');
    await pastedFormula(editor);

    notice(editor)?.querySelector('button')?.click();

    expect(documentText(editor)).toBe('Start Area \\(x\\)');
    expect(notice(editor)).toBeNull();
  });

  it('typing closes the notice', async () => {
    const editor = open('Start ');
    await pastedFormula(editor);

    editor.view.dispatch(editor.view.state.replaceSelection('!'), { userEvent: 'input.type' });

    expect(notice(editor)).toBeNull();
  });

  it('Escape and the focus leaving close the notice', async () => {
    const editor = open('Start ');
    await pastedFormula(editor);
    editor.view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const isShownAfterEscape = notice(editor) !== null;
    editor.view.dispatch(editor.view.state.replaceSelection(' '));
    await pastedFormula(editor);

    editor.view.contentDOM.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    );

    expect(isShownAfterEscape).toBe(false);
    expect(notice(editor)).toBeNull();
  });

  it('one Ctrl+Z restores the document from before the paste', async () => {
    const editor = open('Start ');
    await pastedFormula(editor);
    notice(editor)?.querySelector('button')?.click();

    editor.editor.run('undo');

    expect(documentText(editor)).toBe('Start ');
  });
});
