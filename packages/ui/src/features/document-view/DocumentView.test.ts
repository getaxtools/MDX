import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DocumentView from './DocumentView.svelte';

function renderDocument(html: string | undefined) {
  const onUnsupportedLink = vi.fn();
  const document =
    html === undefined ? undefined : { canonicalKey: 'a.md', fileName: 'a.md', html, outline: [] };
  render(DocumentView, { document, translator: createTranslator(), onUnsupportedLink });
  return { onUnsupportedLink };
}

describe('DocumentView', () => {
  it('invites the user to open a document when none is open', () => {
    renderDocument(undefined);

    expect(screen.getByText(/Open a Markdown document to get started/)).toBeTruthy();
  });

  it('shows the rendered document in a labelled article', () => {
    renderDocument('<h1 id="mdx-guide">Guide</h1>');

    expect(screen.getByRole('article', { name: 'a.md' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeTruthy();
  });

  it('never lets a link navigate the app window away', async () => {
    const { onUnsupportedLink } = renderDocument(
      '<a href="https://example.com" data-mdx-link="external">site</a>',
    );

    const wasNotPrevented = await fireEvent.click(screen.getByRole('link', { name: 'site' }));

    expect(wasNotPrevented).toBe(false);
    expect(onUnsupportedLink).toHaveBeenCalledOnce();
  });

  it('scrolls to a heading for in-document links', async () => {
    const { onUnsupportedLink } = renderDocument(
      '<a href="#mdx-usage" data-mdx-link="anchor">usage</a><h2 id="mdx-usage">Usage</h2>',
    );
    const scrollIntoView = vi.fn();
    screen.getByRole('heading', { name: 'Usage' }).scrollIntoView = scrollIntoView;

    await fireEvent.click(screen.getByRole('link', { name: 'usage' }));

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(onUnsupportedLink).not.toHaveBeenCalled();
  });

  it('ignores clicks outside links', async () => {
    const { onUnsupportedLink } = renderDocument('<p>plain text</p>');

    await fireEvent.click(screen.getByText('plain text'));

    expect(onUnsupportedLink).not.toHaveBeenCalled();
  });
});
