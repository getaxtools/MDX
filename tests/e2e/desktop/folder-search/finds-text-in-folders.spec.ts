import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('Find in Folders', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('finds text in the opened folder and opens the document at the match', async () => {
    await mainWindow.pressShortcut('Ctrl+Shift+F');
    const searchBox = app.browser.$('input[type="search"][aria-label="Search in folders"]');
    await searchBox.waitForDisplayed();
    await searchBox.setValue('Release notes');
    await mainWindow.pressShortcut('Enter');

    const match = app.browser.$('button.match*=Release notes');
    await match.waitForDisplayed();
    await match.click();

    await mainWindow.waitForActiveTab('release-notes.md');
    await app.browser.waitUntil(async () =>
      /^1 of \d+$/.test(await app.browser.$('[role="search"] [role="status"]').getText()),
    );
    expect(await app.browser.$('[role="search"] input').getValue()).toBe('Release notes');
  });

  it('meets WCAG 2.2 AA with results shown', async () => {
    await mainWindow.pressShortcut('Ctrl+Shift+F');
    const searchBox = app.browser.$('input[type="search"][aria-label="Search in folders"]');
    await searchBox.waitForDisplayed();
    await searchBox.setValue('the');
    await mainWindow.pressShortcut('Enter');
    await app.browser.$('button.match').waitForDisplayed();

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
