import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('keyboard shortcuts', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('opens with F1 and narrows the list to the shortcuts matching the search', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();

    await mainWindow.pressShortcut('F1');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.waitForDisplayed();
    await dialog.$('input[type="search"]').setValue('reopen closed');

    await app.browser.waitUntil(async () => (await dialog.$$('tbody tr').length) === 1);
    expect(await dialog.$('tbody tr').getText()).toContain('Ctrl+Shift+T');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
