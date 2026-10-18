import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryAppState, InMemoryDocumentFiles, InMemoryDocumentRequests } from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
  render(ViewerApp, { controller, translator, platform: 'windows' });
  return { requests };
}

describe('ViewerApp', () => {
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
});
