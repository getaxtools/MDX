import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const WINDOWS_DOCUMENT = 'windows.md';

describe('editing a document', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(WINDOWS_DOCUMENT), '# Title\r\n\r\nFirst line.\r\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [WINDOWS_DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('saves typed text with Ctrl+S and keeps the Windows line breaks', async () => {
    await mainWindow.typeAtEndOfDocument('Added line.');
    await mainWindow.waitForUnsavedTab(WINDOWS_DOCUMENT);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(WINDOWS_DOCUMENT);
    expect(readFileSync(workspace.documentPath(WINDOWS_DOCUMENT), 'utf8')).toBe(
      '# Title\r\n\r\nFirst line.\r\nAdded line.',
    );
  });

  it('makes the selected word bold with Ctrl+B', async () => {
    await mainWindow.typeAtEndOfDocument('word');
    await mainWindow.pressShortcut('Shift+Home');

    await mainWindow.pressShortcut('Ctrl+B');
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(WINDOWS_DOCUMENT);
    expect(readFileSync(workspace.documentPath(WINDOWS_DOCUMENT), 'utf8')).toBe(
      '# Title\r\n\r\nFirst line.\r\n**word**',
    );
  });

  it('asks before closing a document with unsaved changes and leaves the file alone on Don’t Save', async () => {
    await mainWindow.typeAtEndOfDocument('Not wanted.');
    await mainWindow.waitForUnsavedTab(WINDOWS_DOCUMENT);

    await mainWindow.pressShortcut('Ctrl+W');
    await mainWindow.answerUnsavedChanges('saving.unsavedDialog.discard');

    await mainWindow.waitForTabs([]);
    expect(readFileSync(workspace.documentPath(WINDOWS_DOCUMENT), 'utf8')).toBe(
      '# Title\r\n\r\nFirst line.\r\n',
    );
  });

  it('keeps edits when another program changes the file, and reloads it on request', async () => {
    await mainWindow.typeAtEndOfDocument('Mine.');
    await mainWindow.waitForUnsavedTab(WINDOWS_DOCUMENT);

    writeFileSync(workspace.documentPath(WINDOWS_DOCUMENT), '# Changed elsewhere\r\n');
    await mainWindow.waitForNotice('editing.conflict.message', { path: WINDOWS_DOCUMENT });
    await mainWindow.clickNoticeAction('editing.conflict.reload');

    await mainWindow.waitForSavedTab(WINDOWS_DOCUMENT);
    await app.browser.waitUntil(async () =>
      (await app.browser.$('[role="textbox"]').getText()).includes('# Changed elsewhere'),
    );
  });

  it('reverts to the saved text from the command palette', async () => {
    await mainWindow.typeAtEndOfDocument('Unwanted.');
    await mainWindow.waitForUnsavedTab(WINDOWS_DOCUMENT);

    await mainWindow.searchInCommandPalette('>revert');
    await mainWindow.waitForCommandPaletteOption('Revert to Saved');
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForSavedTab(WINDOWS_DOCUMENT);
    expect(await app.browser.$('[role="textbox"]').getText()).not.toContain('Unwanted.');
  });

  it('closes brackets and backticks as they are typed', async () => {
    await mainWindow.typeAtEndOfDocument('(');
    await mainWindow.typeAtEndOfDocument('`');

    await app.browser.waitUntil(async () =>
      (await app.browser.$('[role="textbox"]').getText()).includes('()``'),
    );
  });

  it('undoes typing with Undo from the command palette', async () => {
    await mainWindow.typeAtEndOfDocument('To be undone.');
    await mainWindow.waitForUnsavedTab(WINDOWS_DOCUMENT);

    await mainWindow.searchInCommandPalette('>undo');
    await mainWindow.waitForCommandPaletteOption('Undo');
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForSavedTab(WINDOWS_DOCUMENT);
  });
});
