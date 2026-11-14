import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'blocks.md';

describe('the block menu', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), 'First.\n\nSecond.\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs([DOCUMENT]);
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Shift+F10 then Move down', async () => {
    await app.browser.$('[role="textbox"][aria-label^="Source of"]').click();
    await mainWindow.pressShortcut('Ctrl+Home');

    await mainWindow.pressShortcut('Shift+F10');
    const menu = app.browser.$('[role="menu"]');
    await menu.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    const moveDown = await menu.$('button*=Move Block Down').getElement();
    await app.browser.execute((button) => button.click(), moveDown);

    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe('Second.\n\nFirst.\n');
  });
});
