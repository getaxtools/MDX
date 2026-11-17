import { createSourceEditor } from '@mdx/editor';
import {
  createCodeHighlighter,
  createHtmlSanitizer,
  createMarkdownRenderer,
  createRichBlockRenderer,
} from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { texOfMathml } from '../../packages/editor/src/formula-paste/mathmlToTex';

const DOCUMENT_WITH_EVERY_PLUGIN = [
  '# Title',
  '',
  'Footnote[^1], H~2~O, x^2^, ==marked==, :smile:, HTML and $x^2$.',
  '',
  '*[HTML]: HyperText Markup Language',
  '',
  'Term',
  ': definition',
  '',
  '> [!NOTE]',
  '> An alert.',
  '',
  '- [x] done',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '[^1]: The note.',
].join('\n');

describe('runtime dependencies with a frozen prototype', () => {
  it('Object.prototype is frozen before the dependencies load', () => {
    expect(Object.isFrozen(Object.prototype)).toBe(true);
  });

  it('CodeMirror state and view load and edit', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const onChange = vi.fn();
    const editor = createSourceEditor({ parent, text: '# Guide\n', label: 'Source', phrases: {}, onChange });

    editor.replaceText('# Guide\nMore **text** and $x$.');
    editor.setEditingMode('richText');
    editor.run('undo');

    expect(onChange.mock.calls).toEqual([['# Guide\nMore **text** and $x$.'], ['# Guide\n']]);
    editor.destroy();
  });

  it('KaTeX renders a formula', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<span class="mdx-math-inline">\\frac{a}{b}</span>';

    await createRichBlockRenderer({ window }).renderInto(root, { isStillShown: () => true });

    expect(root.querySelector('.katex')).not.toBeNull();
  });

  it('Shiki highlights code', async () => {
    const lines = await createCodeHighlighter().highlight("const greeting = 'hello';", 'typescript');

    expect(lines?.[0]?.length).toBeGreaterThan(1);
  });

  it('DOMPurify sanitizes', () => {
    const sanitize = createHtmlSanitizer(window);

    const html = sanitize('<p onclick="alert(1)">Safe</p><script>alert(2)</script>');

    expect(html).toContain('Safe');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
  });

  it('markdown-it renders with every plugin', () => {
    const rendered = createMarkdownRenderer({ window }).render(DOCUMENT_WITH_EVERY_PLUGIN);
    const page = new DOMParser().parseFromString(rendered.html, 'text/html');

    expect(rendered.outline.map((entry) => entry.text)).toEqual(['Title']);
    for (const selector of [
      'sup',
      'sub',
      'mark',
      'abbr',
      'dl',
      '.markdown-alert',
      '.task-list-item',
      '.mdx-math-inline',
      '.mdx-math-display',
    ]) {
      expect(page.querySelector(selector), selector).not.toBeNull();
    }
    expect(page.body.textContent).toContain('😄');
    expect(page.body.textContent).toContain('The note.');
  });

  it('MathML converter loads and converts with the prototype frozen', async () => {
    const fraction = '<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>';

    expect(await texOfMathml(fraction)).toBe(String.raw`\frac{x}{2}`);
  });
});
