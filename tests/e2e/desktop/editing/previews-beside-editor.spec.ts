import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const LONG_DOCUMENT = 'long.md';
const SECTION_COUNT = 60;

function longDocument(): string {
  const sections = Array.from(
    { length: SECTION_COUNT },
    (_, index) =>
      `## Section ${String(index + 1)}\n\nA paragraph of text for section ${String(index + 1)}.\n`,
  );
  return `# Long document\n\n${sections.join('\n')}`;
}

describe('the preview beside the editor', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(LONG_DOCUMENT), longDocument());
    app = await DesktopApp.launch({ workspace, documentFileNames: [LONG_DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('opens the editor and the preview side by side with Ctrl+\\ and shows typed text in the preview', async () => {
    await mainWindow.pressShortcut('Ctrl+\\');
    await mainWindow.previewBesideEditor().waitForDisplayed();

    await mainWindow.typeAtEndOfDocument('Typed beside the preview.');

    await app.browser.waitUntil(async () =>
      (await mainWindow.previewBesideEditor().getText()).includes('Typed beside the preview.'),
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('scrolls the preview along with the editor', async () => {
    await mainWindow.toolbarToggle('toolbar.previewBeside').click();
    await mainWindow.previewBesideEditor().waitForDisplayed();

    // Scrolled again on every try: the editor puts itself back where the tab was once it has loaded.
    await app.browser.waitUntil(
      async () =>
        app.browser.execute(() => {
          const editorScroller = document.querySelector('.cm-scroller');
          const preview = document.querySelector('section main');
          if (!editorScroller || !preview) return false;
          editorScroller.scrollTop = editorScroller.scrollHeight;
          editorScroller.dispatchEvent(new Event('scroll'));
          return preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 80;
        }),
      { timeoutMsg: 'The preview did not follow the editor to the end of the document' },
    );
  });
});
