import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';
import { nonProseRanges } from './proseOnlySpelling';

let editor: SourceEditor | undefined;

function openEditor(options: Partial<SourceEditorOptions>) {
  const parent = document.createElement('div');
  document.body.append(parent);
  editor = createSourceEditor({
    parent,
    text: '',
    label: 'Source',
    phrases: {},
    onChange: vi.fn(),
    ...options,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  return { editor, view };
}

function spellcheckOf(view: EditorView): string | null {
  return view.contentDOM.getAttribute('spellcheck');
}

const APP_DEFAULTS = { isInRichText: true, isInSource: false };

const DOCUMENT = [
  '---',
  'titel: draft',
  '---',
  'Some prose with a mispeled word.',
  '',
  '```ts',
  'const fooBarBaz = 1;',
  '```',
  '',
  'Call `quxQuux()` or see $\\alpha$ and https://exampel.com and [the site](https://exampel.org).',
  '',
  'Open [[Projekt notes]] and <span class="hilite">text</span>.',
  '',
  '$$',
  '\\frac{a}{b}',
  '$$',
].join('\n');

describe('spell check in the editor', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('Rich text checks spelling by default and Source does not', () => {
    const { editor: opened, view } = openEditor({ editingMode: 'richText', spellCheck: APP_DEFAULTS });
    expect(spellcheckOf(view)).toBe('true');

    opened.setEditingMode('source');

    expect(spellcheckOf(view)).toBe('false');
  });

  it('turning the setting off marks no word in the open editor', () => {
    const { editor: opened, view } = openEditor({ editingMode: 'richText', spellCheck: APP_DEFAULTS });

    opened.setSpellCheckSettings({ isInRichText: false, isInSource: false });

    expect(spellcheckOf(view)).toBe('false');
    expect(view.contentDOM.querySelector('[spellcheck="false"]')).toBeNull();
  });

  it('checks nothing without settings', () => {
    const { view } = openEditor({ editingMode: 'richText' });

    expect(spellcheckOf(view)).toBe('false');
  });

  it('code, inline code, math, URLs, front matter and HTML are excluded', () => {
    const { view } = openEditor({ editingMode: 'source', text: DOCUMENT });

    const excluded = nonProseRanges(view.state, { from: 0, to: view.state.doc.length }).map(({ from, to }) =>
      view.state.sliceDoc(from, to),
    );

    expect(excluded).toEqual(
      expect.arrayContaining([
        '---\ntitel: draft\n---',
        '```ts\nconst fooBarBaz = 1;\n```',
        '`quxQuux()`',
        '$\\alpha$',
        'https://exampel.com',
        'https://exampel.org',
        '[[Projekt notes]]',
        '<span class="hilite">',
        '$$\n\\frac{a}{b}\n$$',
      ]),
    );
    expect(excluded.some((text) => text.includes('mispeled'))).toBe(false);
    expect(excluded.some((text) => text.includes('the site'))).toBe(false);
  });

  it('marks the excluded stretches in the editor, leaving prose to the checker', () => {
    const { view } = openEditor({
      editingMode: 'source',
      text: 'A mispeled word and `codeWord` here.',
      spellCheck: { isInRichText: false, isInSource: true },
    });

    const excluded = [...view.contentDOM.querySelectorAll('[spellcheck="false"]')].map(
      (node) => node.textContent,
    );

    expect(spellcheckOf(view)).toBe('true');
    expect(excluded.join('')).toContain('codeWord');
    expect(excluded.join('')).not.toContain('mispeled');
  });
});
