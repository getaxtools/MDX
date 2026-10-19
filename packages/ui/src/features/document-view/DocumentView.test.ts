import type { ReadingWidth } from '@mdx/core';
import type { RichBlockRenderer } from '@mdx/renderer';
import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DocumentView from './DocumentView.svelte';

interface ViewOptions {
  readonly zoomPercent?: number;
  readonly readingWidth?: ReadingWidth;
  readonly onScroll?: (scrollRatio: number) => void;
  readonly isSourceView?: boolean;
  readonly richBlocks?: RichBlockRenderer;
}

function renderDocument(
  html: string | undefined,
  {
    zoomPercent = 100,
    readingWidth = 'medium',
    onScroll = () => undefined,
    isSourceView = false,
    richBlocks,
  }: ViewOptions = {},
) {
  const onOpenLink = vi.fn();
  const onCommand = vi.fn();
  const document =
    html === undefined
      ? undefined
      : {
          canonicalKey: 'a.md',
          displayPath: 'a.md',
          fileName: 'a.md',
          isUntitled: false,
          html,
          outline: [],
          statistics: { words: 0, characters: 0, readingMinutes: 0 },
          encoding: 'utf-8',
          lineEnding: 'lf' as const,
          scrollRatio: 0.5,
          source: '# Source',
        };
  render(DocumentView, {
    document,
    zoomPercent,
    readingWidth,
    translator: createTranslator(),
    onOpenLink,
    onScroll,
    isSourceView,
    onCommand,
    richBlocks,
  });
  return { onOpenLink, onCommand };
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
    const { onOpenLink } = renderDocument('<a href="https://example.com" data-mdx-link="external">site</a>');

    const wasNotPrevented = await fireEvent.click(screen.getByRole('link', { name: 'site' }));

    expect(wasNotPrevented).toBe(false);
    expect(onOpenLink).toHaveBeenCalledWith({ kind: 'external', href: 'https://example.com' });
  });

  it('scrolls to a heading for in-document links', async () => {
    const { onOpenLink } = renderDocument(
      '<a href="#mdx-usage" data-mdx-link="anchor">usage</a><h2 id="mdx-usage">Usage</h2>',
    );
    const scrollIntoView = vi.fn();
    screen.getByRole('heading', { name: 'Usage' }).scrollIntoView = scrollIntoView;

    await fireEvent.click(screen.getByRole('link', { name: 'usage' }));

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it('ignores clicks outside links', async () => {
    const { onOpenLink } = renderDocument('<p>plain text</p>');

    await fireEvent.click(screen.getByText('plain text'));

    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it('reports links to other documents', async () => {
    const { onOpenLink } = renderDocument('<a href="next%20steps.md" data-mdx-link="document">next</a>');

    await fireEvent.click(screen.getByRole('link', { name: 'next' }));

    expect(onOpenLink).toHaveBeenCalledWith({ kind: 'document', href: 'next%20steps.md' });
  });

  it('opens a document at the place it was last read', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);

    renderDocument('<p>Long text</p>');

    expect(screen.getByRole('main').scrollTop).toBe(500);
    vi.restoreAllMocks();
  });

  it('reports how far the document is scrolled once scrolling settles', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    const onScroll = vi.fn();
    renderDocument('<p>Long text</p>', { onScroll });
    const area = screen.getByRole('main');

    area.scrollTop = 250;
    await fireEvent.scroll(area);
    vi.runAllTimers();

    expect(onScroll).toHaveBeenCalledWith(0.25);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the Markdown source instead of the rendered document in source view', () => {
    renderDocument('<h1>Rendered</h1>', { isSourceView: true });

    const article = screen.getByRole('article', { name: 'a.md' });

    expect(article.textContent).toContain('# Source');
    expect(screen.queryByRole('heading', { name: 'Rendered' })).toBeNull();
  });

  it('scales the document to the zoom level', () => {
    renderDocument('<p>Text</p>', { zoomPercent: 150 });

    expect(screen.getByRole('article', { name: 'a.md' }).style.zoom).toBe('1.5');
  });

  it('lets the document use the full width when asked', () => {
    renderDocument('<p>Text</p>', { readingWidth: 'full' });

    expect(screen.getByRole('main').style.getPropertyValue('--reading-measure')).toBe('none');
  });

  it('offers Select All from the right-click menu and keeps Copy disabled without a selection', async () => {
    renderDocument('<p>First</p><p>Second</p>');
    const article = screen.getByRole('article', { name: 'a.md' });

    await fireEvent.contextMenu(article, { clientX: 5, clientY: 5 });
    expect(screen.getByRole('menuitem', { name: 'Copy' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Select All' }));

    expect(globalThis.getSelection()?.toString()).toContain('Second');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs viewer actions such as Show Source from the right-click menu', async () => {
    const { onCommand } = renderDocument('<p>Text</p>');

    await fireEvent.contextMenu(screen.getByRole('article', { name: 'a.md' }), { clientX: 5, clientY: 5 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Show Source' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'toggleSourceView' });
  });

  it('zooms with Ctrl and the mouse wheel, and scrolls normally without Ctrl', async () => {
    const { onCommand } = renderDocument('<p>Text</p>');
    const area = screen.getByRole('main');

    await fireEvent.wheel(area, { deltaY: -100, ctrlKey: true });
    await fireEvent.wheel(area, { deltaY: 100, ctrlKey: true });
    await fireEvent.wheel(area, { deltaY: 100 });

    expect(onCommand.mock.calls).toEqual([[{ kind: 'zoomIn' }], [{ kind: 'zoomOut' }]]);
  });

  it('typesets the math in the rendered document', async () => {
    const renderInto = vi.fn<RichBlockRenderer['renderInto']>(() => Promise.resolve());

    renderDocument('<p><span class="mdx-math-inline">x</span></p>', { richBlocks: { renderInto } });

    await vi.waitFor(() => expect(renderInto).toHaveBeenCalled());
    expect(renderInto.mock.calls[0]?.[0].getAttribute('aria-label')).toBe('a.md');
  });

  it('leaves math as source in source view', () => {
    const renderInto = vi.fn(() => Promise.resolve());

    renderDocument('<p>x</p>', { richBlocks: { renderInto }, isSourceView: true });

    expect(renderInto).not.toHaveBeenCalled();
  });
});
