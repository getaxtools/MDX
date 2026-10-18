import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryAppState, InMemoryDocumentFiles, InMemoryDocumentRequests } from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ViewerApp from './ViewerApp.svelte';
import { ViewerController } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';

async function renderViewer(startupPaths: string[] = []) {
  const requests = new InMemoryDocumentRequests(startupPaths);
  const translator = createTranslator();
  const controller = new ViewerController({
    session: new ViewerSession({
      documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide\n\nWelcome.', [NOTES]: '# Notes' }),
      appState: new InMemoryAppState(),
      now: () => 0,
    }),
    requests,
    renderer: createMarkdownRenderer({ window }),
    translator,
  });
  await controller.start();
  render(ViewerApp, {
    controller,
    translator,
    platform: 'windows',
    appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
  });
  return { requests, controller };
}

describe('ViewerApp', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens documents picked with Ctrl+O and shows the active one', async () => {
    const { requests } = await renderViewer();
    requests.pickedPaths = [GUIDE];

    await userEvent.keyboard('{Control>}o{/Control}');

    expect(await screen.findByRole('tab', { name: 'Guide.md', selected: true })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeTruthy();
  });

  it('stars the active document from the toolbar and lists it under favourites', async () => {
    await renderViewer([GUIDE]);
    const starButton = await screen.findByRole('button', { name: /Favourite/ });

    await userEvent.click(starButton);

    expect(starButton.getAttribute('aria-pressed')).toBe('true');
    const favourites = screen.getByRole('region', { name: 'Favourites' });
    expect(favourites.textContent).toContain('Guide.md');
  });

  it('switches documents when another tab is chosen', async () => {
    await renderViewer([GUIDE, NOTES]);

    await userEvent.click(await screen.findByRole('tab', { name: 'Guide.md' }));

    expect(await screen.findByRole('article', { name: 'Guide.md' })).toBeTruthy();
  });

  it('closes the active tab with Ctrl+W', async () => {
    await renderViewer([GUIDE, NOTES]);
    await screen.findByRole('tab', { name: 'Notes.md' });

    await userEvent.keyboard('{Control>}w{/Control}');

    expect(screen.queryByRole('tab', { name: 'Notes.md' })).toBeNull();
  });

  it('disables the star button when no document is open', async () => {
    await renderViewer();

    expect((await screen.findByRole('button', { name: /Favourite/ })).hasAttribute('disabled')).toBe(true);
  });

  it('hides and shows the sidebar with Ctrl+B', async () => {
    await renderViewer();
    await screen.findByRole('navigation', { name: 'Favourites and recent files' });

    await userEvent.keyboard('{Control>}b{/Control}');

    expect(screen.queryByRole('navigation', { name: 'Favourites and recent files' })).toBeNull();
  });

  it('zooms the document with Ctrl+= and applies a chosen theme to the page', async () => {
    await renderViewer([GUIDE]);
    await screen.findByRole('article', { name: 'Guide.md' });

    await userEvent.keyboard('{Control>}={/Control}');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'Dark');

    expect(screen.getByRole('button', { name: 'Zoom 110%' })).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('shows statistics for the active document in the status bar', async () => {
    await renderViewer([GUIDE]);

    const statusBar = await screen.findByRole('contentinfo', { name: 'Document information' });

    expect(statusBar.textContent).toContain('2 words');
  });

  it('shows the About dialog when asked and closes it again', async () => {
    const { controller } = await renderViewer();

    await controller.execute({ kind: 'showAbout' });
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'About MDX' })).toBeNull();
  });

  it('stays at the end of the document after scrolling there', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    await renderViewer([GUIDE]);
    await screen.findByRole('article', { name: 'Guide.md' });
    const readingArea = screen.getByRole('main');
    vi.useFakeTimers();

    readingArea.scrollTop = 1000;
    await fireEvent.scroll(readingArea);
    vi.runAllTimers();
    await tick();

    expect(readingArea.scrollTop).toBe(1000);
  });
});
