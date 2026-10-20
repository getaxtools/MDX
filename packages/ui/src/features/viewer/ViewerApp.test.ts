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

  it('hides and shows the sidebar from the activity bar', async () => {
    await renderViewer();
    const sidebarButton = await screen.findByRole('button', { name: 'Explorer' });

    await userEvent.click(sidebarButton);
    expect(screen.queryByRole('region', { name: 'Favourites' })).toBeNull();
    await userEvent.click(sidebarButton);

    expect(screen.getByRole('region', { name: 'Favourites' })).toBeTruthy();
  });

  it('turns cells pasted with Ctrl+Alt+V into a new document that cannot be starred until saved', async () => {
    await renderViewer();

    await userEvent.keyboard('{Control>}{Alt>}v{/Alt}{/Control}');
    await fireEvent.input(await screen.findByRole('textbox', { name: 'Cells' }), {
      target: { value: 'Fruit\tQty\r\nApple\t3\r\n' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open as New Document' }));

    expect(
      await screen.findByRole('tab', { name: 'Untitled-1.md (not saved)', selected: true }),
    ).toBeTruthy();
    expect(await screen.findByRole('cell', { name: 'Apple' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Favourite' }).hasAttribute('disabled')).toBe(true);
  });

  it('stars the active document from the toolbar and lists it under favourites', async () => {
    await renderViewer([GUIDE]);
    const starButton = await screen.findByRole('button', { name: 'Favourite' });

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

    expect((await screen.findByRole('button', { name: 'Favourite' })).hasAttribute('disabled')).toBe(true);
  });

  it('opens the command palette with Ctrl+Shift+P and opens a document from it', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await renderViewer([GUIDE, NOTES]);

    await userEvent.keyboard('{Control>}{Shift>}P{/Shift}{/Control}');
    await screen.findByRole('dialog', { name: 'Command palette' });
    await screen.findByRole('option', { name: /Guide\.md/ });
    await userEvent.keyboard('guide{Enter}');

    expect(await screen.findByRole('tab', { name: 'Guide.md', selected: true })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('switches to the source editor with Ctrl+/ and marks the tab while edits are unsaved', async () => {
    const { controller } = await renderViewer([GUIDE]);
    await screen.findByRole('heading', { name: 'Guide' });

    await userEvent.keyboard('{Control>}/{/Control}');
    await screen.findByRole('textbox', { name: 'Source of Guide.md' });
    controller.updateEditedText(GUIDE.toLowerCase(), '# Guide\n\nEdited.');

    expect(await screen.findByRole('tab', { name: 'Guide.md (unsaved changes)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Edited.')).toBeTruthy();
  });

  it('hides and shows the Explorer with Ctrl+Shift+E', async () => {
    await renderViewer();
    await screen.findByRole('navigation', { name: 'Explorer' });

    await userEvent.keyboard('{Control>}{Shift>}E{/Shift}{/Control}');

    expect(screen.queryByRole('navigation', { name: 'Explorer' })).toBeNull();
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
