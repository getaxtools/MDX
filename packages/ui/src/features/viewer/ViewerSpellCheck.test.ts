import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
  type DocumentLocation,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ProtectedDocuments } from '../editing/editorSpellCheck';
import ViewerApp from './ViewerApp.svelte';
import { ViewerController } from './ViewerController';

/** The editor loads on first use, which can take seconds under coverage on a busy machine. */
const EDITOR_WAIT = { timeout: 10_000 };
const GUIDE = 'C:\\Docs\\Guide.md';

async function renderEditing(protectedDocuments?: ProtectedDocuments) {
  const translator = createTranslator();
  const controller = new ViewerController({
    session: new ViewerSession({
      documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide\n\nSome prose.' }),
      appState: new InMemoryAppState(),
      now: () => 0,
    }),
    requests: new InMemoryDocumentRequests([GUIDE]),
    renderer: createMarkdownRenderer({ window }),
    translator,
    links: new InMemoryDocumentLinks(),
    ...(protectedDocuments ? { protectedDocuments } : {}),
  });
  await controller.start();
  render(ViewerApp, {
    controller,
    translator,
    platform: 'windows',
    appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
  });
  await screen.findByRole('tab', { name: 'Guide.md', selected: true });
  await userEvent.keyboard('{Control>}e{/Control}');
  const content = await screen.findByRole('textbox', { name: 'Source of Guide.md' }, EDITOR_WAIT);
  return { controller, content };
}

function rightClick(target: Element, init: PointerEventInit = { pointerType: 'mouse' }): boolean {
  const event = new PointerEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, ...init });
  return target.dispatchEvent(event);
}

describe('spell check in the viewer', () => {
  it('right-click in the editor is not prevented when spelling is on', async () => {
    const { content } = await renderEditing();

    expect(content.getAttribute('spellcheck')).toBe('true');
    expect(rightClick(content.querySelector('.cm-line') ?? content)).toBe(true);
  });

  it('right-click elsewhere is still prevented', async () => {
    await renderEditing();

    expect(rightClick(screen.getByRole('tab', { name: 'Guide.md' }))).toBe(false);
  });

  it('the menu asked for from the keyboard is still the app’s, not the webview’s', async () => {
    const { content } = await renderEditing();

    expect(rightClick(content, { pointerType: '' })).toBe(false);
  });

  it('right-click in the editor is prevented while spelling is off', async () => {
    const { controller, content } = await renderEditing();

    await controller.execute({ kind: 'toggleSpellCheckInRichText' });

    await expect.poll(() => content.getAttribute('spellcheck')).toBe('false');
    expect(rightClick(content)).toBe(false);
  });

  it('a protected document is never spell checked, whatever the setting', async () => {
    const isProtected = (location: DocumentLocation) => location.fileName === 'Guide.md';
    const { content } = await renderEditing({ isProtected });

    expect(content.getAttribute('spellcheck')).toBe('false');
    expect(rightClick(content)).toBe(false);
  });
});
