import { ViewerSession, WorkspaceKindsState, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryAttachments,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ViewerApp from './ViewerApp.svelte';
import { ViewerController } from './ViewerController';

/** The control wheel loads on first use, which can take seconds under coverage on a busy machine. */
const LAZY_LOAD_WAIT = { timeout: 10_000 };

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';

async function renderViewer(
  startupPaths: string[] = [],
  files: Readonly<Record<string, string>> = {},
  attachments?: InMemoryAttachments,
) {
  const requests = new InMemoryDocumentRequests(startupPaths);
  const translator = createTranslator();
  const links = new InMemoryDocumentLinks();
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({
      [GUIDE]: '# Guide\n\nWelcome.',
      [NOTES]: '# Notes',
      ...files,
    }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  const controller = new ViewerController({
    session,
    requests,
    renderer: createMarkdownRenderer({ window }),
    translator,
    links,
    ...(attachments ? { attachments } : {}),
  });
  await controller.start();
  render(ViewerApp, {
    controller,
    translator,
    platform: 'windows',
    appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
  });
  return { requests, controller, session, links };
}

const NOTES_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'planned' },
];

async function renderViewerWithNotesBuilt() {
  const viewer = await renderViewer();
  viewer.session.updateWorkspaceKinds(() =>
    WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
      NOTES_BUILT,
    ),
  );
  await tick();
  return viewer;
}

// The editor is a separate chunk loaded on first use; loading it once here keeps each test within its time.
beforeAll(async () => {
  await import('@mdx/editor');
}, 60_000);

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

  it('greets an empty window with a start page that creates a new document', async () => {
    await renderViewer();

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'New Document' }));

    expect(await screen.findByRole('tab', { name: /Untitled-1\.md/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Welcome' })).toBeNull();
  });

  it('widens the Explorer with the arrow keys on its splitter', async () => {
    await renderViewer();
    const splitter = await screen.findByRole('separator', { name: 'Resize Explorer' });

    splitter.focus();
    await userEvent.keyboard('{ArrowRight}');

    await vi.waitFor(() =>
      expect(screen.getByRole('separator', { name: 'Resize Explorer' }).getAttribute('aria-valuenow')).toBe(
        '276',
      ),
    );
  });

  it('shows the preview beside the editor with its own splitter', async () => {
    await renderViewer([GUIDE]);

    await userEvent.click(await screen.findByRole('button', { name: 'Side by Side' }));

    expect(await screen.findByRole('region', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Resize editor and preview' })).toBeTruthy();
  });

  it('hides and shows the sidebar from the activity bar', async () => {
    await renderViewer();
    const sidebarButton = await screen.findByRole('button', { name: 'Explorer' });

    await userEvent.click(sidebarButton);
    expect(screen.queryByRole('region', { name: 'Favourites' })).toBeNull();
    await userEvent.click(sidebarButton);

    expect(screen.getByRole('region', { name: 'Favourites' })).toBeTruthy();
  });

  describe('side bar buttons', () => {
    it('the header button hides the side bar', async () => {
      await renderViewer([GUIDE]);

      await userEvent.click(await screen.findByRole('button', { name: 'Hide side bar' }));

      expect(screen.queryByRole('region', { name: 'Favourites' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Explorer' }).getAttribute('aria-pressed')).toBe('false');
      expect(screen.getByRole('button', { name: 'Show side bar' })).toBeTruthy();
    });

    it('the tab strip button shows the side bar', async () => {
      await renderViewer([GUIDE]);
      await userEvent.click(await screen.findByRole('button', { name: 'Hide side bar' }));

      await userEvent.click(screen.getByRole('button', { name: 'Show side bar' }));

      expect(screen.getByRole('region', { name: 'Favourites' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Show side bar' })).toBeNull();
    });

    it('focus moves to the document when the side bar hides', async () => {
      await renderViewer([GUIDE]);
      const article = await screen.findByRole('article', { name: 'Guide.md' });
      screen.getByRole('button', { name: 'Hide side bar' }).focus();

      await userEvent.keyboard('{Enter}');

      await vi.waitFor(() => expect(document.activeElement).toBe(article.closest('main')));
    });

    it('hiding the side bar from the keyboard while editing puts focus in the editor', async () => {
      await renderViewer([GUIDE]);
      await userEvent.click(await screen.findByRole('button', { name: 'Side by Side' }));
      const source = await screen.findByRole('textbox', { name: 'Source of Guide.md' }, LAZY_LOAD_WAIT);
      screen.getByRole('button', { name: 'Hide side bar' }).focus();

      await userEvent.keyboard('{Enter}');

      await vi.waitFor(() => expect(source.contains(document.activeElement)).toBe(true));
    });

    it('the activity bar button is pressed only while the side bar is shown', async () => {
      await renderViewer([GUIDE]);
      const explorerButton = await screen.findByRole('button', { name: 'Explorer' });
      expect(explorerButton.getAttribute('aria-pressed')).toBe('true');

      await userEvent.click(screen.getByRole('button', { name: 'Hide side bar' }));
      expect(explorerButton.getAttribute('aria-pressed')).toBe('false');
      await userEvent.click(screen.getByRole('button', { name: 'Show side bar' }));

      expect(explorerButton.getAttribute('aria-pressed')).toBe('true');
    });

    it('hides the side bar whatever view it shows', async () => {
      await renderViewer([GUIDE]);
      await userEvent.keyboard('{Control>}{Shift>}O{/Shift}{/Control}');

      await userEvent.click(await screen.findByRole('button', { name: 'Hide side bar' }));

      expect(screen.getByRole('button', { name: 'Show side bar' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe('false');
    });
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

  it('Ctrl+E toggles editing and marks the tab while edits are unsaved', async () => {
    const { controller } = await renderViewer([GUIDE]);
    await screen.findByRole('heading', { name: 'Guide' });

    await userEvent.keyboard('{Control>}e{/Control}');
    await screen.findByRole('textbox', { name: 'Source of Guide.md' });
    controller.updateEditedText(GUIDE.toLowerCase(), '# Guide\n\nEdited.');

    expect(await screen.findByRole('tab', { name: 'Guide.md (unsaved changes)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Edited.')).toBeTruthy();
  });

  describe('Rich text and Source', () => {
    const LINKS = 'C:\\Docs\\Links.md';
    const LARGE = 'C:\\Docs\\Large.md';
    const EDITOR_WAIT = { timeout: 5_000 };

    // CodeMirror measures text positions, which jsdom does not lay out.
    beforeEach(() => {
      Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [new DOMRect(0, 0, 1, 1)],
      });
      Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(0, 0, 1, 1),
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(Range.prototype, 'getClientRects');
      Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    });

    async function editedTextBox(fileName: string): Promise<HTMLElement> {
      await userEvent.keyboard('{Control>}e{/Control}');
      return screen.findByRole('textbox', { name: `Source of ${fileName}` }, EDITOR_WAIT);
    }

    function isShownInRichText(textBox: HTMLElement): boolean {
      return textBox.closest('.cm-editor')?.classList.contains('cm-rich-text') ?? false;
    }

    async function linkText(textBox: HTMLElement, text: string): Promise<Element> {
      return vi.waitFor(
        () =>
          [...textBox.querySelectorAll('.cm-rich-link')].find((link) => link.textContent === text) ??
          Promise.reject(new Error(`No link named ${text}`)),
        EDITOR_WAIT,
      );
    }

    it('Ctrl+/ switches to Source and back, and each change is announced once', async () => {
      await renderViewer([GUIDE]);
      await screen.findByRole('heading', { name: 'Guide' });
      const textBox = await editedTextBox('Guide.md');
      const wasRichTextAtFirst = isShownInRichText(textBox);

      await userEvent.keyboard('{Control>}/{/Control}');
      await vi.waitFor(() => expect(isShownInRichText(textBox)).toBe(false));
      const announcements = screen
        .getAllByRole('status')
        .map((region) => region.textContent.trim())
        .filter((text) => text.endsWith('mode'));
      await userEvent.keyboard('{Control>}/{/Control}');

      expect(wasRichTextAtFirst).toBe(true);
      expect(announcements).toEqual(['Source mode']);
      await vi.waitFor(() => expect(isShownInRichText(textBox)).toBe(true));
    });

    it('the Formatting toolbar shows while editing and is hidden in the preview', async () => {
      await renderViewer([GUIDE]);
      await screen.findByRole('heading', { name: 'Guide' });
      const isShownInPreview = screen.queryByRole('toolbar', { name: 'Formatting' }) !== null;

      await editedTextBox('Guide.md');
      const toolbar = await screen.findByRole('toolbar', { name: 'Formatting' });
      await userEvent.keyboard('{Control>}e{/Control}');

      expect(isShownInPreview).toBe(false);
      expect(within(toolbar).getByRole('button', { name: 'Rich text' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      await vi.waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull());
    });

    it('the mode carries over to the next document opened for editing', async () => {
      await renderViewer([GUIDE, NOTES]);
      await screen.findByRole('heading', { name: 'Notes' });
      await editedTextBox('Notes.md');
      await userEvent.keyboard('{Control>}/{/Control}');
      await userEvent.keyboard('{Control>}e{/Control}');

      await userEvent.click(screen.getByRole('tab', { name: 'Guide.md' }));
      const guide = await editedTextBox('Guide.md');

      expect(isShownInRichText(guide)).toBe(false);
    });

    it('Ctrl+click opens a relative link in a tab', async () => {
      await renderViewer([LINKS], { [LINKS]: 'See [the notes](Notes.md).\n\nEnd' });
      await screen.findByRole('tab', { name: 'Links.md', selected: true });
      const textBox = await editedTextBox('Links.md');

      await fireEvent.mouseDown(await linkText(textBox, 'the notes'), { ctrlKey: true, button: 0 });

      expect(await screen.findByRole('tab', { name: 'Notes.md', selected: true })).toBeTruthy();
    });

    it('external link asks first', async () => {
      const { links } = await renderViewer([LINKS], {
        [LINKS]: 'Visit [the site](https://example.com).\n\nEnd',
      });
      await screen.findByRole('tab', { name: 'Links.md', selected: true });
      const textBox = await editedTextBox('Links.md');

      await fireEvent.mouseDown(await linkText(textBox, 'the site'), { ctrlKey: true, button: 0 });

      expect(await screen.findByRole('alertdialog', { name: 'Open link in your browser?' })).toBeTruthy();
      expect(links.openedExternalLinks).toEqual([]);
    });

    it('a document over 1 MB opens in Source with a notice that names the reason', async () => {
      await renderViewer([LARGE], { [LARGE]: 'a'.repeat(1_048_577) });
      await screen.findByRole('tab', { name: 'Large.md', selected: true });

      const textBox = await editedTextBox('Large.md');

      expect(isShownInRichText(textBox)).toBe(false);
      expect(
        await screen.findByText('Large.md is larger than 1 MB, so it is edited in Source mode.'),
      ).toBeTruthy();
    });

    it('the Image button copies the chosen pictures and links them at the caret', async () => {
      const attachments = new InMemoryAttachments();
      attachments.pictureChoice = ['C:\\Pictures\\chart.png'];
      const { controller } = await renderViewer([GUIDE], {}, attachments);
      await screen.findByRole('heading', { name: 'Guide' });
      await editedTextBox('Guide.md');
      const updateEditedText = vi.spyOn(controller, 'updateEditedText');

      await userEvent.click(await screen.findByRole('button', { name: 'Image' }));

      await vi.waitFor(() =>
        expect(updateEditedText).toHaveBeenLastCalledWith(
          GUIDE.toLowerCase(),
          expect.stringContaining('![chart](assets/chart.png)'),
        ),
      );
      expect(attachments.pictureDialogFilters).toEqual(['Pictures']);
    });

    it('Untitled document asks to save first', async () => {
      const attachments = new InMemoryAttachments();
      attachments.pictureChoice = ['C:\\Pictures\\chart.png'];
      await renderViewer([], {}, attachments);
      await userEvent.click(await screen.findByRole('button', { name: 'New Document' }));
      await screen.findByRole('textbox', { name: 'Source of Untitled-1.md' }, EDITOR_WAIT);

      await userEvent.click(await screen.findByRole('button', { name: 'Image' }));

      expect(
        await screen.findByText('Save the document first, so the picture can be copied next to it.'),
      ).toBeTruthy();
      expect(attachments.pictureDialogFilters).toEqual([]);
    });

    it('Edit Formula in the preview opens the document for editing with the equation editor on it', async () => {
      const AREA = 'C:\\Docs\\Area.md';
      await renderViewer([AREA], { [AREA]: 'Area $a$ and $x^2$ here.' });
      await screen.findByRole('tab', { name: 'Area.md', selected: true });
      const formula = await vi.waitFor(() => {
        const shown = [...document.querySelectorAll('.mdx-math-inline')].at(1);
        return shown ?? Promise.reject(new Error('The preview has no formula yet'));
      });

      await fireEvent.contextMenu(formula);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit Formula' }));

      const dialog = await screen.findByRole('dialog', { name: 'Equation' }, EDITOR_WAIT);
      expect(within(dialog).getByRole('textbox', { name: 'TeX source' }).textContent).toBe('x^2');
      expect(screen.getByRole('textbox', { name: 'Source of Area.md' })).toBeTruthy();
    });

    it('click on a rendered formula edits it', async () => {
      const AREA = 'C:\\Docs\\Area.md';
      const { controller } = await renderViewer([AREA], { [AREA]: 'Area $x^2$ here.' });
      await screen.findByRole('tab', { name: 'Area.md', selected: true });
      const textBox = await editedTextBox('Area.md');
      const formula = await vi.waitFor(
        () => within(textBox).getByRole('img', { name: 'Formula x^2' }),
        EDITOR_WAIT,
      );
      const updateEditedText = vi.spyOn(controller, 'updateEditedText');

      await fireEvent.mouseDown(formula, { button: 0 });
      const dialog = await screen.findByRole('dialog', { name: 'Equation' }, EDITOR_WAIT);
      const source = within(dialog).getByRole('textbox', { name: 'TeX source' });
      await userEvent.keyboard('{Backspace}3');
      await vi.waitFor(() => expect(source.textContent).toBe('x^3'));
      await userEvent.keyboard('{Enter}');

      expect(screen.queryByRole('dialog', { name: 'Equation' })).toBeNull();
      expect(updateEditedText).toHaveBeenLastCalledWith(AREA.toLowerCase(), 'Area $x^3$ here.');
      expect(textBox.contains(document.activeElement)).toBe(true);
    });
  });

  it('moves the editor caret to a heading chosen while the editor is still starting', async () => {
    await renderViewer([GUIDE]);
    await screen.findByRole('heading', { name: 'Guide' });
    await userEvent.click(screen.getByRole('button', { name: 'Outline' }));
    const outline = await screen.findByRole('navigation', { name: 'Outline' });
    const heldFrames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((frame) => heldFrames.push(frame));

    await userEvent.keyboard('{Control>}e{/Control}');
    const source = await screen.findByRole('textbox', { name: 'Source of Guide.md' });
    await userEvent.click(within(outline).getByRole('button', { name: 'Guide' }));
    for (const frame of heldFrames.splice(0)) frame(0);
    await tick();

    expect(source.contains(document.activeElement)).toBe(true);
  });

  it('a Formatting toolbar press while the editor is still starting is kept for it', async () => {
    const { controller } = await renderViewer([GUIDE]);
    await screen.findByRole('heading', { name: 'Guide' });
    const heldFrames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((frame) => heldFrames.push(frame));

    await userEvent.keyboard('{Control>}e{/Control}');
    const toolbar = await screen.findByRole('toolbar', { name: 'Formatting' });
    await screen.findByRole('textbox', { name: 'Source of Guide.md' });
    const updateEditedText = vi.spyOn(controller, 'updateEditedText');
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Callout' }));
    for (const frame of heldFrames.splice(0)) frame(0);
    await tick();

    await vi.waitFor(() =>
      expect(updateEditedText).toHaveBeenLastCalledWith(
        GUIDE.toLowerCase(),
        expect.stringContaining('> [!NOTE]'),
      ),
    );
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
    await userEvent.click(screen.getByRole('button', { name: 'Theme' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Dark' }));

    expect(screen.getByRole('button', { name: 'Zoom 110%, reset' })).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('moves focus between the activity bar, the Explorer, the tabs, the document and the status bar with F6', async () => {
    await renderViewer([GUIDE]);
    const article = await screen.findByRole('article', { name: 'Guide.md' });
    const documentArea = article.closest('main');

    await userEvent.keyboard('{F6}');
    expect(screen.getByRole('navigation', { name: 'Panels' }).contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{F6}');
    expect(screen.getByRole('navigation', { name: 'Explorer' }).contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{F6}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Guide\.md/ }));
    await userEvent.keyboard('{F6}');
    expect(document.activeElement).toBe(documentArea);
    await userEvent.keyboard('{Shift>}{F6}{/Shift}');

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Guide\.md/ }));
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

  it('shows the control wheel only after it is first opened, and removes it when it closes', async () => {
    const { controller } = await renderViewer();
    expect(screen.queryByRole('dialog', { name: 'Control wheel' })).toBeNull();

    await controller.execute({ kind: 'toggleControlWheel' });
    expect(await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT)).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Control wheel', hidden: true })).toBeNull();
      expect(screen.queryByRole('menu', { name: 'Workspace kinds', hidden: true })).toBeNull();
    });
  });

  it('a changed wheel shortcut works at once and the default keys stop working', async () => {
    const { controller } = await renderViewer();
    await controller.execute({
      kind: 'setShortcut',
      commandId: 'toggleControlWheel',
      combination: ['ctrl', 'shift', 'J'],
    });

    await userEvent.keyboard('{Control>}{Shift>} {/Shift}{/Control}');
    await tick();
    expect(screen.queryByRole('dialog', { name: 'Control wheel' })).toBeNull();
    await userEvent.keyboard('{Control>}{Shift>}J{/Shift}{/Control}');

    expect(await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT)).toBeTruthy();
  });

  it('shows the status bar wheel button only when the setting is on, and it opens the wheel', async () => {
    const { controller } = await renderViewer();
    expect(screen.queryByRole('button', { name: /show control wheel/ })).toBeNull();

    await controller.execute({ kind: 'toggleWheelButtonInStatusBar' });
    await userEvent.click(await screen.findByRole('button', { name: 'Markdown viewer, show control wheel' }));

    expect(await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT)).toBeTruthy();
  });

  it('opens the wheel with the kind choices for Choose Workspace Kinds', async () => {
    const { controller } = await renderViewer();

    await controller.execute({ kind: 'showWorkspaceKindSettings' });

    expect(await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT)).toBeTruthy();
    expect(await screen.findByRole('dialog', { name: 'Workspace kinds' })).toBeTruthy();
  });

  it('the pointer listener exists only while the option is on', async () => {
    const addListener = vi.spyOn(globalThis, 'addEventListener');
    const removeListener = vi.spyOn(globalThis, 'removeEventListener');
    const { controller } = await renderViewer();
    const pointerListenersAdded = () => addListener.mock.calls.filter(([type]) => type === 'pointermove');
    expect(pointerListenersAdded()).toHaveLength(0);

    await controller.execute({ kind: 'toggleWheelOpenedAtPointer' });
    await tick();
    expect(pointerListenersAdded()).toHaveLength(1);
    await controller.execute({ kind: 'toggleWheelOpenedAtPointer' });
    await tick();

    expect(removeListener.mock.calls.some(([type]) => type === 'pointermove')).toBe(true);
  });

  it('the wheel opens at the last pointer position', async () => {
    const { controller } = await renderViewer();
    await controller.execute({ kind: 'toggleWheelOpenedAtPointer' });
    await tick();

    await fireEvent.pointerMove(globalThis.document.body, { clientX: 500, clientY: 400 });
    await controller.execute({ kind: 'toggleControlWheel' });

    const wheel = await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT);
    expect(wheel.style.left).toBe('400px');
  });

  describe('kind bar and control wheel', () => {
    const kindBar = () => screen.getByRole('group', { name: 'Workspace kinds' });

    it("a kind turned off in the bar's popup leaves the wheel", async () => {
      const { controller } = await renderViewerWithNotesBuilt();
      await userEvent.click(screen.getByRole('button', { name: 'Choose workspace kinds' }));

      await userEvent.click(screen.getByRole('switch', { name: /^Notes/ }));
      await userEvent.keyboard('{Escape}');
      await controller.execute({ kind: 'toggleControlWheel' });

      await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT);
      expect(screen.getAllByRole('menuitemradio').map((item) => item.getAttribute('aria-label'))).toEqual([
        'Markdown viewer',
      ]);
    });

    it("switching in the wheel presses the kind's bar button", async () => {
      const { controller } = await renderViewerWithNotesBuilt();
      await controller.execute({ kind: 'toggleControlWheel' });
      await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT);

      await userEvent.keyboard('2');

      expect(kindBar().querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe('Notes');
    });

    it('turning off the active kind from the bar announces both kinds', async () => {
      await renderViewerWithNotesBuilt();
      await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
      await userEvent.click(screen.getByRole('button', { name: 'Choose workspace kinds' }));

      await userEvent.click(screen.getByRole('switch', { name: /^Notes/ }));

      expect(await screen.findByText('Notes is off. Showing Markdown viewer.')).toBeTruthy();
    });

    it('a closing wheel cannot be clicked', async () => {
      const { controller } = await renderViewerWithNotesBuilt();
      await controller.execute({ kind: 'toggleControlWheel' });
      await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT);
      await userEvent.keyboard('{Escape}');

      await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Notes', hidden: true }));

      expect(screen.getByRole('dialog', { name: 'Control wheel', hidden: true }).inert).toBe(true);
      expect(kindBar().querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
        'Markdown viewer',
      );
    });

    it('the shortcut during the fade opens the same wheel again at once', async () => {
      const { controller } = await renderViewerWithNotesBuilt();
      await controller.execute({ kind: 'toggleControlWheel' });
      const wheel = await screen.findByRole('dialog', { name: 'Control wheel' }, LAZY_LOAD_WAIT);
      await userEvent.keyboard('{Escape}');

      await userEvent.keyboard('{Control>}{Shift>} {/Shift}{/Control}');

      expect(screen.getByRole('dialog', { name: 'Control wheel' })).toBe(wheel);
      expect(wheel.inert).toBe(false);
    });

    it('hides the kind bar when the setting is wheel only', async () => {
      const { controller } = await renderViewerWithNotesBuilt();
      expect(kindBar()).toBeTruthy();

      await controller.execute({ kind: 'setKindSwitcher', kindSwitcher: 'wheel' });
      await tick();

      expect(screen.queryByRole('group', { name: 'Workspace kinds' })).toBeNull();
    });
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
