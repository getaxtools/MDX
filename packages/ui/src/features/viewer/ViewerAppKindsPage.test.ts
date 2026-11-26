import { ViewerSession, WorkspaceKindsState, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryAppState, InMemoryDocumentFiles, InMemoryDocumentRequests } from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import ViewerApp from './ViewerApp.svelte';
import { ViewerController } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'planned' },
];

async function renderViewerOnKindsPage() {
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide\n\nWelcome.' }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  const translator = createTranslator();
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([GUIDE]),
    renderer: createMarkdownRenderer({ window }),
    translator,
  });
  await controller.start();
  session.updateWorkspaceKinds(() =>
    WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
      NOTES_BUILT,
    ),
  );
  render(ViewerApp, {
    controller,
    translator,
    platform: 'windows',
    appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
  });
  await screen.findByRole('heading', { name: 'Guide' });
  await controller.execute({ kind: 'showWorkspaceKindsPage' });
  await tick();
  return { controller };
}

function kindsPage() {
  return screen.queryByRole('main', { name: 'Workspace kinds' });
}

function onKindsPage() {
  return within(screen.getByRole('main', { name: 'Workspace kinds' }));
}

function appNotice(): string {
  const pageStatus = onKindsPage().getByRole('status');
  const notices = screen.getAllByRole('status').filter((status) => status !== pageStatus);
  return notices.map((status) => status.textContent.trim()).join('');
}

describe('ViewerApp workspace kinds page', () => {
  it('shows the kinds page in place of the document, without the tabs or the document toolbar', async () => {
    await renderViewerOnKindsPage();

    expect(kindsPage()).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Guide' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Open documents' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Document actions' })).toBeNull();
  });

  it('keeps the app notice and the status bar while the kinds page is shown', async () => {
    const { controller } = await renderViewerOnKindsPage();

    await controller.execute({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    await waitFor(() => expect(appNotice()).toContain('Showing Notes.'));
    expect(screen.getByRole('contentinfo', { name: 'Document information' })).toBeTruthy();
  });

  it('showing the kinds page puts the focus on the page', async () => {
    await renderViewerOnKindsPage();

    expect(globalThis.document.activeElement).toBe(kindsPage());
  });

  it('esc on the page closes it and puts the focus back in the document', async () => {
    await renderViewerOnKindsPage();
    onKindsPage().getByRole('button', { name: 'Markdown viewer' }).focus();

    await userEvent.keyboard('{Escape}');

    await screen.findByRole('heading', { name: 'Guide' });
    expect(kindsPage()).toBeNull();
    expect(globalThis.document.activeElement?.closest('.reading-area')).not.toBeNull();
  });

  it('esc with nothing focused closes the page', async () => {
    await renderViewerOnKindsPage();
    (globalThis.document.activeElement as HTMLElement | null)?.blur();

    await userEvent.keyboard('{Escape}');

    await screen.findByRole('heading', { name: 'Guide' });
    expect(kindsPage()).toBeNull();
  });

  it('esc closes a dialog open over the page and leaves the page shown', async () => {
    const { controller } = await renderViewerOnKindsPage();
    await controller.execute({ kind: 'showAbout' });
    await screen.findByRole('dialog', { name: /About/ });

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /About/ })).toBeNull();
    expect(kindsPage()).not.toBeNull();
  });

  it('esc with the focus lost from a dialog over the page leaves the page shown', async () => {
    const { controller } = await renderViewerOnKindsPage();
    await controller.execute({ kind: 'showAbout' });
    await screen.findByRole('dialog', { name: /About/ });
    (globalThis.document.activeElement as HTMLElement | null)?.blur();

    await userEvent.keyboard('{Escape}');

    expect(kindsPage()).not.toBeNull();
  });

  it('the page shows the control wheel shortcut as changed in settings', async () => {
    const { controller } = await renderViewerOnKindsPage();

    await controller.execute({
      kind: 'setShortcut',
      commandId: 'toggleControlWheel',
      combination: ['ctrl', 'shift', 'J'],
    });
    await tick();

    expect(screen.getByRole('button', { name: /Show control wheel/ }).textContent).toContain('Ctrl+Shift+J');
  });

  it('a kind chosen on the page is announced by the page only', async () => {
    await renderViewerOnKindsPage();

    await userEvent.click(onKindsPage().getByRole('button', { name: 'Notes' }));

    await onKindsPage().findByText('Showing Notes.');
    expect(appNotice()).toBe('');
  });
});
