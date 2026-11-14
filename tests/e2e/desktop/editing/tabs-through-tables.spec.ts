import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'table.md';

describe('tables in the editor', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '| Name | Size |\n|---|---|\n| a | 1 |');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs([DOCUMENT]);
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Tab through a table in Source mode', async () => {
    await mainWindow.typeAtEndOfDocument('');
    await mainWindow.pressShortcut('Tab');
    await app.browser.execute(() => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- still the only way to insert text as an input method does
      document.execCommand('insertText', false, 'b');
    });
    await mainWindow.pressShortcut('Tab');
    await app.browser.execute(() => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- still the only way to insert text as an input method does
      document.execCommand('insertText', false, '2');
    });

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '| Name | Size |\n|---|---|\n| a | 1 |\n| b | 2 |',
    );
  });
});
