import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDesktopShell,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewerApp from '../viewer/ViewerApp.svelte';
import { ViewerController } from '../viewer/ViewerController';

const GUIDE = 'C:\\Docs\\guide.md';

async function renderViewerWithWorkspaces() {
  const translator = createTranslator();
  const desktopShell = new InMemoryDesktopShell();
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide' }),
    appState: new InMemoryAppState(),
    workspaceStore: new InMemoryWorkspaceStore(),
    now: () => 0,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([GUIDE]),
    renderer: createMarkdownRenderer({ window }),
    translator,
    desktopShell,
  });
  await controller.start();
  render(ViewerApp, {
    controller,
    translator,
    platform: 'windows',
    appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
  });
  return { controller, desktopShell };
}

describe('the workspace in the side bar header and the title', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('the header button names the workspace and its kind', async () => {
    await renderViewerWithWorkspaces();

    const button = await screen.findByRole('button', {
      name: 'Switch Workspace, now showing Default (Markdown viewer)',
    });

    expect(button.textContent.trim()).toBe('Default');
  });

  it('the header button opens the switcher with focus in the filter', async () => {
    await renderViewerWithWorkspaces();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Switch Workspace, now showing Default (Markdown viewer)' }),
    );

    const filter = await screen.findByRole('combobox', { name: 'Filter workspaces' });
    expect(document.activeElement).toBe(filter);
  });

  it('the window title names the document and the workspace, and follows a rename', async () => {
    const { controller, desktopShell } = await renderViewerWithWorkspaces();

    const titleBefore = desktopShell.windowTitle;
    await controller.execute({ kind: 'renameWorkspace', name: 'Handbook' });

    expect(titleBefore).toBe('guide.md - Default - MDX');
    expect(desktopShell.windowTitle).toBe('guide.md - Handbook - MDX');
    expect(await screen.findByRole('button', { name: /now showing Handbook/ })).toBeTruthy();
  });
});
