import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StatusBar from './StatusBar.svelte';

describe('StatusBar', () => {
  it('shows word count, characters, reading time, encoding and line endings', () => {
    render(StatusBar, {
      document: {
        canonicalKey: 'a.md',
        fileName: 'a.md',
        html: '',
        outline: [],
        statistics: { words: 1, characters: 1234, readingMinutes: 3 },
        encoding: 'utf-8',
        lineEnding: 'crlf',
        scrollRatio: 0,
        source: '# Source',
      },
      translator: createTranslator(),
    });

    const statusBar = screen.getByRole('contentinfo', { name: 'Document information' });

    expect(statusBar.textContent).toContain('1 word');
    expect(statusBar.textContent).toContain('1,234 characters');
    expect(statusBar.textContent).toContain('3 min read');
    expect(statusBar.textContent).toContain('Encoding: UTF-8');
    expect(statusBar.textContent).toContain('Line endings: CRLF');
  });

  it('is empty when no document is open', () => {
    render(StatusBar, { document: undefined, translator: createTranslator() });

    expect(screen.getByRole('contentinfo').textContent.trim()).toBe('');
  });
});
