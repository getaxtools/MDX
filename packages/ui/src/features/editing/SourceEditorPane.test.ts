import { ViewerSession, type Typography } from '@mdx/core';
import type { SourceEditor, WrittenLink } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';
import { openLinkFromEditor } from './editorLinks';
import SourceEditorPane from './SourceEditorPane.svelte';

const KEY = 'c:\\docs\\guide.md';
/** The editor chunk loads and parses in the background, which takes longer on a busy test machine. */
const EDITOR_LOAD_WAIT = { timeout: 5_000 };

function renderPane() {
  const onChange = vi.fn();
  const props = {
    canonicalKey: KEY,
    fileName: 'Guide.md',
    text: '# Guide\n',
    zoomPercent: 100,
    translator: createTranslator(),
    onChange,
  };
  const { rerender } = render(SourceEditorPane, props);
  return { props, rerender, onChange };
}

interface RichTextPaneOptions {
  readonly typography?: Typography;
  readonly onOpenLink?: (link: WrittenLink) => void;
}

/** Opens the pane in Rich text, through the editor's own switch, with the caret on a zero-based line. */
async function renderRichText(text: string, caretLine: number, options: RichTextPaneOptions = {}) {
  let shownEditor: SourceEditor | undefined;
  const props = {
    canonicalKey: KEY,
    fileName: 'Guide.md',
    text,
    zoomPercent: 100,
    typography: options.typography ?? 'github',
    translator: createTranslator(),
    onChange: vi.fn(),
    onOpenLink: options.onOpenLink ?? vi.fn(),
    onReady: (editor: SourceEditor | undefined) => (shownEditor = editor),
  };
  const { rerender } = render(SourceEditorPane, props);
  const textBox = await screen.findByRole('textbox', { name: 'Source of Guide.md' }, EDITOR_LOAD_WAIT);
  const editor = await vi.waitFor(
    () => shownEditor ?? Promise.reject(new Error('The editor is not ready')),
    EDITOR_LOAD_WAIT,
  );
  editor.setEditingMode('richText');
  editor.revealLine(caretLine);
  return { editor, textBox, props, rerender };
}

const LINKS_PATH = 'C:\\Docs\\Links.md';
const NOTES_PATH = 'C:\\Docs\\Notes.md';
const LINKS_TEXT =
  'See [the notes](Notes.md), [the site](https://example.com) or [log in](https://аpple.com/login).\n\nEnd';

/** The pane in Rich text, its links opened through the app's link activation for the open Links.md. */
async function renderPaneOpeningLinks() {
  const translator = createTranslator();
  const links = new InMemoryDocumentLinks();
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [LINKS_PATH]: LINKS_TEXT, [NOTES_PATH]: '# Notes' }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([LINKS_PATH]),
    renderer: createMarkdownRenderer({ window }),
    translator,
    links,
  });
  await controller.start();
  let latestSnapshot: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latestSnapshot = snapshot));
  const onOpenLink = (link: WrittenLink) =>
    openLinkFromEditor(link, [], {
      openLink: (link) => void controller.openLink(link),
      goToHeading: () => undefined,
    });
  const pane = await renderRichText(LINKS_TEXT, 2, { onOpenLink });
  const activePath = () => session.currentState().tabStrip.activeTab()?.location.displayPath;
  return { ...pane, links, activePath, snapshot: () => latestSnapshot };
}

/** The font family the page's style sheets give an element, read from the rules that match it. */
function declaredFontFamilyOf(element: Element): string {
  let fontFamily = '';
  for (const rule of styleRules(document.styleSheets)) {
    if (element.matches(rule.selectorText) && rule.style.fontFamily) fontFamily = rule.style.fontFamily;
  }
  return fontFamily;
}

function styleRules(sheets: StyleSheetList | CSSRuleList, isForcedColours = false): CSSStyleRule[] {
  return [...sheets].flatMap((item) => {
    if (item instanceof CSSStyleSheet) return styleRules(item.cssRules, isForcedColours);
    if (item instanceof CSSMediaRule) {
      if (item.media.mediaText.includes('forced-colors') !== isForcedColours) return [];
      return [...item.cssRules].filter((rule) => rule instanceof CSSStyleRule);
    }
    return item instanceof CSSStyleRule && !isForcedColours ? [item] : [];
  });
}

function forcedColourOf(element: Element): string {
  const matching = styleRules(document.styleSheets, true).filter((rule) =>
    element.matches(rule.selectorText),
  );
  return matching.at(-1)?.style.color ?? '';
}

describe('SourceEditorPane', () => {
  // The editor is a separate chunk loaded on first use; loading it once here keeps each test within its time.
  beforeAll(async () => {
    await import('@mdx/editor');
  }, 60_000);

  it('loads the editor with the document text and a label naming the file', async () => {
    renderPane();

    const textBox = await screen.findByRole('textbox', { name: 'Source of Guide.md' });

    expect(textBox.textContent).toContain('# Guide');
  });

  it('shows text reloaded from disk and reports it as the current text', async () => {
    const { props, rerender, onChange } = renderPane();
    const textBox = await screen.findByRole('textbox', { name: 'Source of Guide.md' });

    await rerender({
      ...props,
      editorRequest: { id: 1, canonicalKey: KEY, kind: 'replaceText', text: '# New' },
    });

    expect(textBox.textContent).toBe('# New');
    expect(onChange).toHaveBeenLastCalledWith('# New');
  });

  it('runs menu commands meant for its own document only', async () => {
    const { props, rerender, onChange } = renderPane();
    await screen.findByRole('textbox', { name: 'Source of Guide.md' });
    await rerender({
      ...props,
      editorRequest: { id: 1, canonicalKey: KEY, kind: 'replaceText', text: '# New' },
    });

    await rerender({
      ...props,
      editorRequest: { id: 2, canonicalKey: 'c:\\docs\\other.md', kind: 'command', command: 'undo' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await rerender({
      ...props,
      editorRequest: { id: 3, canonicalKey: KEY, kind: 'command', command: 'undo' },
    });

    expect(onChange).toHaveBeenLastCalledWith('# Guide\n');
  });

  describe('in Rich text', () => {
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

    it('checkbox named by the item text and reports its state', async () => {
      await renderRichText('- [ ] Pay **rent**\n- [x] Buy milk\n\nEnd', 3);

      const payRent = await screen.findByRole('checkbox', { name: 'Pay rent' }, EDITOR_LOAD_WAIT);
      const buyMilk = await screen.findByRole('checkbox', { name: 'Buy milk' }, EDITOR_LOAD_WAIT);

      expect(payRent.getAttribute('aria-checked')).toBe('false');
      expect(buyMilk.getAttribute('aria-checked')).toBe('true');
      expect(payRent.tabIndex).toBe(-1);
    });

    it('Book style changes the editor font', async () => {
      const { textBox, props, rerender } = await renderRichText('Some text', 0, { typography: 'github' });
      const githubFont = declaredFontFamilyOf(textBox);

      await rerender({ ...props, typography: 'book' });

      expect(githubFont).toBe('var(--font-reading)');
      expect(declaredFontFamilyOf(textBox)).toBe('var(--font-serif)');
    });

    it('forced colours keep link and heading text visible', async () => {
      const { textBox } = await renderRichText('# Results\n\nSee [the guide](guide.md).\n\nEnd', 4);

      const link = within(textBox).getByText('the guide');
      const heading = textBox.querySelector('.cm-line');

      expect(heading?.textContent).toBe('Results');
      expect(forcedColourOf(link).toLowerCase()).toBe('linktext');
      expect(heading ? forcedColourOf(heading).toLowerCase() : '').toBe('canvastext');
    });

    it('Open Link is offered only with the caret in a link', async () => {
      const { editor, textBox } = await renderRichText('Plain text\n\nSee [the guide](guide.md).', 0);

      textBox.focus();
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      const menuAwayFromLink = within(screen.getByRole('menu', { name: 'Block' }));
      expect(menuAwayFromLink.queryByRole('menuitem', { name: 'Open Link' })).toBeNull();
      await userEvent.keyboard('{Escape}');
      editor.revealLine(2);
      await userEvent.keyboard('{ArrowRight>6/}');
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');

      expect(
        within(screen.getByRole('menu', { name: 'Block' })).getByRole('menuitem', { name: 'Open Link' }),
      ).toBeTruthy();
    });
  });

  describe('opening links in Rich text', () => {
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

    it('Ctrl+click opens a relative link in a tab', async () => {
      const { textBox, activePath } = await renderPaneOpeningLinks();

      await fireEvent.mouseDown(within(textBox).getByText('the notes'), { ctrlKey: true, button: 0 });

      await vi.waitFor(() => expect(activePath()).toBe(NOTES_PATH));
    });

    it('external link asks first', async () => {
      const { textBox, links, snapshot } = await renderPaneOpeningLinks();

      await fireEvent.mouseDown(within(textBox).getByText('the site'), { ctrlKey: true, button: 0 });

      expect(snapshot()?.externalLinkRequest).toBe('https://example.com');
      expect(links.openedExternalLinks).toEqual([]);
    });

    it('the confirmation names the address as the preview links it', async () => {
      const { textBox, snapshot } = await renderPaneOpeningLinks();

      await fireEvent.mouseDown(within(textBox).getByText('log in'), { ctrlKey: true, button: 0 });

      expect(snapshot()?.externalLinkRequest).toBe('https://xn--pple-43d.com/login');
    });

    it('plain click places the caret', async () => {
      const { textBox, activePath, snapshot } = await renderPaneOpeningLinks();
      const linkText = within(textBox).getByText('the notes');
      textBox.blur();

      await fireEvent.mouseDown(linkText, { button: 0 });
      await fireEvent.mouseUp(linkText, { button: 0 });

      // jsdom has no layout to place the caret by; the editor taking focus shows it handled the click itself.
      expect(document.activeElement).toBe(textBox);
      expect(activePath()).toBe(LINKS_PATH);
      expect(snapshot()?.externalLinkRequest).toBeUndefined();
    });
  });
});
