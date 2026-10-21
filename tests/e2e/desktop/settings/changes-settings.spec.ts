import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('Settings', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('opens with Ctrl+, and applies a chosen typography and theme at once', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();

    await mainWindow.pressShortcut('Ctrl+,');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.waitForDisplayed();
    await mainWindow.chooseOption('[role="dialog"] select#setting-typography', 'academic');
    await mainWindow.chooseOption('[role="dialog"] select#setting-theme', 'dark');

    await app.browser.waitUntil(async () =>
      app.browser.execute(
        () =>
          document.querySelector<HTMLElement>('main article')?.dataset.typography === 'academic' &&
          document.documentElement.dataset.theme === 'dark',
      ),
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('narrows the settings to the ones matching the search', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await mainWindow.pressShortcut('Ctrl+,');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.waitForDisplayed();

    await dialog.$('input[type="search"]').setValue('status bar');

    await app.browser.waitUntil(async () => (await dialog.$$('.setting').length) === 1);
    expect(await dialog.$('input#setting-statusBar').isExisting()).toBe(true);
  });

  it('clears all data after asking, so nothing comes back after a restart', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['release-notes.md'] });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.waitForTabs(['release-notes.md']);
    await firstRun.toggleFavourite();
    await app.browser.waitUntil(() => workspace.savedFavouriteFileNames()?.length === 1);

    await firstRun.pressShortcut('Ctrl+,');
    await app.browser.$('[role="dialog"]').$('button*=Clear All Data').click();
    await app.browser.$('[role="alertdialog"]').$('button=Clear All Data').click();

    await firstRun.waitForTabs([]);
    await app.browser.waitUntil(
      () => workspace.savedFavouriteFileNames()?.length === 0 && workspace.savedTabFileNames()?.length === 0,
    );
    await app.quit();
    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);
    await secondRun.emptyStateText();
    expect(await secondRun.favouriteNames()).toEqual([]);
    expect(await secondRun.recentFileNames()).toEqual([]);
  });
});
