import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('per-workspace settings', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  /** The system theme shows as no theme attribute at all. */
  async function shownTheme(): Promise<string> {
    return app.browser.execute(() => document.documentElement.dataset.theme ?? 'system');
  }

  async function switchTo(name: string): Promise<void> {
    await mainWindow.pressShortcut('Ctrl+Alt+W');
    const filter = app.browser.$('[role="dialog"] [role="combobox"]');
    await filter.waitForDisplayed();
    await filter.setValue(name);
    await mainWindow.pressShortcut('Enter');
  }

  it('a dark theme override follows the workspace on switch', async () => {
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue('Reading');
    await dialog.$('label*=Choose a folder').click();
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Reading - MDX');

    await mainWindow.pressShortcut('Ctrl+,');
    await mainWindow.chooseOption('[role="dialog"] select#setting-theme-scope', 'workspace');
    await mainWindow.chooseOption('[role="dialog"] select#setting-theme', 'dark');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Escape');
    await app.browser.waitUntil(async () => (await shownTheme()) === 'dark');

    await switchTo('Default');
    await app.browser.waitUntil(async () => (await shownTheme()) === 'system');
    await switchTo('Reading');

    await app.browser.waitUntil(async () => (await shownTheme()) === 'dark');
  });
});
