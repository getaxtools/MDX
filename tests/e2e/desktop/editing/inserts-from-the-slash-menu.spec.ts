import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'insert.md';

describe('the insert menu', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Title\n\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('type /tab, Enter inserts a table', async () => {
    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser.$('[role="dialog"]').waitForDisplayed();
    await app.browser.execute(() =>
      document.querySelector<HTMLInputElement>('#setting-slashMenuInSource')?.click(),
    );
    await mainWindow.pressShortcut('Escape');
    await mainWindow.startEditing();

    await mainWindow.typeAtEndOfDocument('/tab');
    await app.browser.$('.cm-tooltip-autocomplete [role="option"]').waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Enter');
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Title\n\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |',
    );
  });
});
