import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'callouts.md';

describe('callouts in Rich text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Notes\n\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs([DOCUMENT]);
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+End');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('insert a callout, change it to Warning, save, file matches the expected bytes', async () => {
    const toolbar = app.browser.$('[role="toolbar"][aria-label="Formatting"]');
    await mainWindow.pressWithPointer(toolbar.$('button[aria-label="Callout"]'));
    // A press made while the editor is still starting runs once it is ready; type into the callout only then.
    await app.browser.$('.cm-content .cm-rich-callout').waitForExist();
    await mainWindow.typeInFocusedField('Remember the backup.');
    await mainWindow.pressShortcut('Ctrl+Home');

    const typeButton = app.browser.$('button[aria-label="Change callout type"]');
    await typeButton.waitForDisplayed();
    await mainWindow.pressWithPointer(typeButton);
    const menu = app.browser.$('[role="menu"][aria-label="Change callout type"]');
    await menu.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressWithPointer(menu.$('button=Warning'));
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Notes\n\n> [!WARNING]\n> Remember the backup.',
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
