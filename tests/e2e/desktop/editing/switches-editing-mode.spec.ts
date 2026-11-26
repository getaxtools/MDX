import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'modes.md';
const BYTE_ORDER_MARK = Buffer.from([0xef, 0xbb, 0xbf]);
/** CRLF, setext headings, `_emphasis_`, `1)` markers and a decomposed é, which a rewrite would change. */
const DOCUMENT_TEXT =
  'A setext heading\r\n================\r\n\r\nSome _emphasis_ and **strong** text.\r\n\r\n1) first\r\n2) second\r\n\r\nCafé au lait.\r\n';

describe('switching between Rich text and Source', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(
      workspace.documentPath(DOCUMENT),
      Buffer.concat([BYTE_ORDER_MARK, Buffer.from(DOCUMENT_TEXT)]),
    );
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('A setext heading');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Ctrl+E switches to editing and back', async () => {
    await mainWindow.pressShortcut('Ctrl+E');
    await app.browser.$('[role="textbox"][aria-label="Source of modes.md"]').waitForDisplayed();

    await mainWindow.pressShortcut('Ctrl+E');

    await app.browser.$('[role="textbox"][aria-label="Source of modes.md"]').waitForExist({ reverse: true });
    await mainWindow.waitForDocumentHeading('A setext heading');
  });

  it('Ctrl+/ switches to Source and back', async () => {
    await mainWindow.openEditor();
    expect(await mainWindow.isEditorInRichText()).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.switchEditingMode();
    expect(await mainWindow.isEditorInRichText()).toBe(false);
    await mainWindow.switchEditingMode();

    expect(await mainWindow.isEditorInRichText()).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('saving after mode switches leaves a CRLF file with a BOM byte-identical', async () => {
    const before = readFileSync(workspace.documentPath(DOCUMENT));
    await mainWindow.openEditor();

    for (let switches = 0; switches < 4; switches += 1) await mainWindow.switchEditingMode();
    await mainWindow.waitForSavedTab(DOCUMENT);
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT)).equals(before)).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
