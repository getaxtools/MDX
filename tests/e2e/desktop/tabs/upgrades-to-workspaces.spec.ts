import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('upgrading to workspaces', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    workspace.saveEarlierVersionState({
      tabFileNames: ['getting-started.md', 'release-notes.md'],
      favouriteFileNames: ['math.md'],
      recentFileNames: ['README.md'],
    });
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('upgrade from an earlier state shows the same tabs, favourites, recent files and folders', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);
    await mainWindow.waitForFavourites(['math.md']);
    expect(await mainWindow.recentFileNames()).toContain('README.md 📌');
    await mainWindow.waitForExplorerFolderEntries(basename(workspace.documentsFolder), [
      'extended-syntax.md',
      'getting-started.md',
      'gfm-showcase.md',
      'math.md',
      'README.md',
      'release-notes.md',
      'script-in-document.md',
    ]);
    expect(workspace.hasWorkspaceDatabase()).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a favourite added in the earlier-version copy appears after restart with a notice', async () => {
    app = await DesktopApp.launch({ workspace });
    await new MainWindowPage(app.browser).waitForFavourites(['math.md']);
    await app.quit();
    workspace.addFavouriteInEarlierVersionCopy('gfm-showcase.md');

    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForNotice('workspaces.earlierVersionChanges', {});
    await mainWindow.waitForFavourites(['math.md', 'gfm-showcase.md']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('Clear All Data then restart shows an empty default workspace', async () => {
    app = await DesktopApp.launch({ workspace });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.waitForFavourites(['math.md']);

    await firstRun.pressShortcut('Ctrl+,');
    await app.browser.$('[role="dialog"]').$('button*=Clear All Data').click();
    await app.browser.$('[role="alertdialog"]').$('button=Clear All Data').click();
    await firstRun.waitForNotice('privacy.clearAllData.done', {});
    await app.quit();
    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);

    await secondRun.emptyStateText();
    expect(await secondRun.favouriteNames()).toEqual([]);
    expect(await secondRun.recentFileNames()).toEqual([]);
  });
});
