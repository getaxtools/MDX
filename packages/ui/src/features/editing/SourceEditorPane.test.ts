import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SourceEditorPane from './SourceEditorPane.svelte';

const KEY = 'c:\\docs\\guide.md';

function renderPane() {
  const onChange = vi.fn();
  const props = {
    canonicalKey: KEY,
    fileName: 'Guide.md',
    text: '# Guide\n',
    zoomPercent: 100,
    translator: createTranslator(),
    onChange,
  };
  const { rerender } = render(SourceEditorPane, props);
  return { props, rerender, onChange };
}

describe('SourceEditorPane', () => {
  it('loads the editor with the document text and a label naming the file', async () => {
    renderPane();

    const textBox = await screen.findByRole('textbox', { name: 'Source of Guide.md' });

    expect(textBox.textContent).toContain('# Guide');
  });

  it('shows text reloaded from disk and reports it as the current text', async () => {
    const { props, rerender, onChange } = renderPane();
    const textBox = await screen.findByRole('textbox', { name: 'Source of Guide.md' });

    await rerender({
      ...props,
      editorRequest: { id: 1, canonicalKey: KEY, kind: 'replaceText', text: '# New' },
    });

    expect(textBox.textContent).toBe('# New');
    expect(onChange).toHaveBeenLastCalledWith('# New');
  });

  it('runs menu commands meant for its own document only', async () => {
    const { props, rerender, onChange } = renderPane();
    await screen.findByRole('textbox', { name: 'Source of Guide.md' });
    await rerender({
      ...props,
      editorRequest: { id: 1, canonicalKey: KEY, kind: 'replaceText', text: '# New' },
    });

    await rerender({
      ...props,
      editorRequest: { id: 2, canonicalKey: 'c:\\docs\\other.md', kind: 'command', command: 'undo' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await rerender({
      ...props,
      editorRequest: { id: 3, canonicalKey: KEY, kind: 'command', command: 'undo' },
    });

    expect(onChange).toHaveBeenLastCalledWith('# Guide\n');
  });
});
