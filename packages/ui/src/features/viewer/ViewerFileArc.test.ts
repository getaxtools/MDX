import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
  InMemoryFolders,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ViewerApp from './ViewerApp.svelte';
import { ViewerController } from './ViewerController';

/** The arc loads on first use, which can take seconds under coverage on a busy machine. */
const LAZY_LOAD_WAIT = { timeout: 10_000 };
const DOCS = 'C:\\Docs';
const README = 'C:\\Docs\\README.md';
const GETTING_STARTED = 'C:\\Docs\\getting-started.md';
const INSTALL = 'C:\\Docs\\install.md';
const ELSEWHERE = 'C:\\Elsewhere\\notes.md';
const NOTCH_DOWN = { ctrlKey: true, deltaY: 100 };

async function renderViewer({
  openPaths = [GETTING_STARTED],
  documents = [README, GETTING_STARTED, INSTALL],
} = {}) {
  const translator = createTranslator();
  const folders = new InMemoryFolders({ [DOCS]: { documents } });
  folders.pickedFolder = DOCS;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({
      [README]: '# Read me',
      [GETTING_STARTED]: '# Getting started',
      [INSTALL]: '# Install',
      [ELSEWHERE]: '# Notes',
    }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests(),
    renderer: createMarkdownRenderer({ window }),
    translator,
    links: new InMemoryDocumentLinks(),
    folders,
  });
  await controller.start();
  await controller.execute({ kind: 'openFolder' });
  await controller.openDocuments(openPaths);
  render(ViewerApp, {
    controller,
    translator,
    platform: 'windows',
    appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
  });
  await screen.findByRole('treeitem', {
    name: InMemoryDocumentFiles.locationOf(documents.at(-1) ?? '').fileName,
  });
  return { controller, session, user: userEvent.setup() };
}

function documentArea(): HTMLElement {
  const area = screen.getByRole('article').closest('main');
  if (!area) throw new Error('no document area');
  return area;
}

const zoomOf = (session: ViewerSession) => session.currentState().viewSettings.zoomPercent;
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent.trim());

async function openArcOnNextFile(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}{ArrowDown}');
  return screen.findByRole('listbox', { name: 'Switch file' }, LAZY_LOAD_WAIT);
}

function highlightedLabel(): string {
  return (
    within(screen.getByRole('listbox', { name: 'Switch file' }))
      .getByRole('option', { selected: true })
      .getAttribute('aria-label') ?? ''
  );
}

/** `install.md, 3 of 3`, the start of the card's name, which goes on with its folder. */
function highlightedName(): string {
  return highlightedLabel().split(', ').slice(0, 2).join(', ');
}

// The editor is a separate chunk loaded on first use; loading it once here keeps each test within its time.
beforeAll(async () => {
  await import('@mdx/editor');
}, 60_000);

describe('the file arc in the viewer', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('ctrl and wheel down opens the arc on the next file without zooming or scrolling', async () => {
    const { session, user } = await renderViewer();
    const area = documentArea();
    await user.keyboard('{Control>}');

    const isScrolling = await fireEvent.wheel(area, NOTCH_DOWN);

    expect(isScrolling).toBe(false);
    await screen.findByRole('listbox', { name: 'Switch file' }, LAZY_LOAD_WAIT);
    expect(highlightedName()).toBe('install.md, 3 of 3');
    expect(zoomOf(session)).toBe(100);
    await user.keyboard('{Escape}{/Control}');
  });

  it('a touchpad pinch still zooms', async () => {
    const { session } = await renderViewer();

    await fireEvent.wheel(documentArea(), { ctrlKey: true, deltaY: -10 });

    expect(zoomOf(session)).toBeGreaterThan(100);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('zooms brings back wheel zoom', async () => {
    const { controller, session, user } = await renderViewer();
    await controller.execute({ kind: 'setCtrlWheelAction', ctrlWheelAction: 'zoom' });
    await user.keyboard('{Control>}');

    await fireEvent.wheel(documentArea(), { ctrlKey: true, deltaY: -100 });

    expect(zoomOf(session)).toBeGreaterThan(100);
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{/Control}');
  });

  it('the keyboard still opens the arc when the wheel zooms', async () => {
    const { controller, user } = await renderViewer();
    await controller.execute({ kind: 'setCtrlWheelAction', ctrlWheelAction: 'zoom' });

    await openArcOnNextFile(user);

    expect(highlightedName()).toBe('install.md, 3 of 3');
    await user.keyboard('{Escape}{/Control}');
  });

  it('letting go opens the file in a new tab and says so', async () => {
    const { user } = await renderViewer();
    await openArcOnNextFile(user);

    await user.keyboard('{/Control}');

    expect(await screen.findByRole('tab', { name: 'install.md', selected: true })).toBeTruthy();
    expect(screen.getByText('Opened install.md.')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('listbox', { name: 'Switch file' })).toBeNull());
  });

  it('letting go focuses a file that is already open', async () => {
    const { user } = await renderViewer({ openPaths: [INSTALL, GETTING_STARTED] });
    await openArcOnNextFile(user);

    await user.keyboard('{/Control}');

    expect(await screen.findByRole('tab', { name: 'install.md', selected: true })).toBeTruthy();
    expect(tabNames()).toHaveLength(2);
  });

  it('letting go on the active file changes nothing', async () => {
    const { user } = await renderViewer();
    await openArcOnNextFile(user);

    await user.keyboard('{ArrowUp}{/Control}');

    expect(screen.getByRole('tab', { name: 'getting-started.md', selected: true })).toBeTruthy();
    expect(tabNames()).toHaveLength(1);
  });

  it('enter opens the highlighted entry while Ctrl is still held', async () => {
    const { user } = await renderViewer();
    await openArcOnNextFile(user);

    await user.keyboard('{Enter}');

    expect(await screen.findByRole('tab', { name: 'install.md', selected: true })).toBeTruthy();
    await user.keyboard('{/Control}');
    expect(tabNames()).toHaveLength(2);
  });

  it('a click opens the clicked name', async () => {
    const { user } = await renderViewer();
    const arc = await openArcOnNextFile(user);

    await fireEvent.click(within(arc).getByRole('option', { name: 'README.md, 1 of 3' }));

    expect(await screen.findByRole('tab', { name: 'README.md', selected: true })).toBeTruthy();
    await user.keyboard('{/Control}');
  });

  it('esc keeps the current file and gives the focus back', async () => {
    const { user } = await renderViewer();
    const area = documentArea();
    area.focus();
    await openArcOnNextFile(user);

    await user.keyboard('{Escape}{/Control}');

    expect(screen.getByRole('tab', { name: 'getting-started.md', selected: true })).toBeTruthy();
    expect(tabNames()).toHaveLength(1);
    expect(screen.getByText('Kept the current file.')).toBeTruthy();
    expect(globalThis.document.activeElement).toBe(area);
  });

  it('switching away from the window keeps the current file', async () => {
    const { user } = await renderViewer();
    await openArcOnNextFile(user);

    await fireEvent.blur(globalThis.window);
    await user.keyboard('{/Control}');

    await vi.waitFor(() => expect(screen.queryByRole('listbox', { name: 'Switch file' })).toBeNull());
    expect(tabNames()).toEqual(['getting-started.md']);
  });

  it('an empty list explains itself', async () => {
    const { user } = await renderViewer({ openPaths: [README], documents: [README] });

    await user.keyboard('{Control>}{ArrowDown}{/Control}');

    expect(await screen.findByText('No other files here.')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a file outside the list starts at the first entry', async () => {
    const { user } = await renderViewer({ openPaths: [ELSEWHERE] });

    await openArcOnNextFile(user);

    expect(highlightedName()).toBe('README.md, 1 of 3');
    await user.keyboard('{Escape}{/Control}');
  });

  it('the keys do nothing while a dialog is open', async () => {
    const { user } = await renderViewer();
    await user.keyboard('{Control>},{/Control}');
    await screen.findByRole('dialog', { name: 'Settings' });

    await user.keyboard('{Control>}{ArrowDown}{/Control}');

    expect(screen.queryByRole('listbox', { name: 'Switch file' })).toBeNull();
  });

  it('lists the tree as it was while the side bar is hidden', async () => {
    const { user } = await renderViewer();
    await user.click(screen.getByRole('button', { name: 'Hide side bar' }));

    await openArcOnNextFile(user);

    expect(highlightedName()).toBe('install.md, 3 of 3');
    await user.keyboard('{Escape}{/Control}');
  });

  it('the keys work while editing and leave the text alone', async () => {
    const { user } = await renderViewer();
    await user.keyboard('{Control>}e{/Control}');
    const source = await screen.findByRole(
      'textbox',
      { name: 'Source of getting-started.md' },
      LAZY_LOAD_WAIT,
    );
    source.focus();
    const textBefore = source.textContent;

    await user.keyboard('{Control>}{ArrowUp}');
    await screen.findByRole('listbox', { name: 'Switch file' }, LAZY_LOAD_WAIT);

    expect(highlightedName()).toBe('README.md, 1 of 3');
    expect(source.textContent).toBe(textBefore);
    await user.keyboard('{Escape}{/Control}');
  });

  it('going back to a file being edited beside its preview puts focus in the editor', async () => {
    const { user } = await renderViewer();
    await user.click(screen.getByRole('button', { name: 'Side by Side' }));
    await screen.findByRole('textbox', { name: 'Source of getting-started.md' }, LAZY_LOAD_WAIT);
    await openArcOnNextFile(user);
    await user.keyboard('{/Control}');
    await screen.findByRole('article', { name: 'install.md' });

    await user.keyboard('{Control>}{ArrowUp}');
    await screen.findByRole('listbox', { name: 'Switch file' }, LAZY_LOAD_WAIT);
    await user.keyboard('{/Control}');

    const source = await screen.findByRole(
      'textbox',
      { name: 'Source of getting-started.md' },
      LAZY_LOAD_WAIT,
    );
    await vi.waitFor(() => expect(source.contains(globalThis.document.activeElement)).toBe(true));
  });

  it('marks the entries already open in a tab', async () => {
    const { user } = await renderViewer({ openPaths: [README, GETTING_STARTED] });

    await user.keyboard('{Control>}{ArrowUp}');
    await screen.findByRole('listbox', { name: 'Switch file' }, LAZY_LOAD_WAIT);

    expect(highlightedName()).toBe('README.md, 1 of 3');
    expect(highlightedLabel()).toMatch(/, Docs( · edited [^,]+)?, open in a tab$/);
    await user.keyboard('{Escape}{/Control}');
  });
});
