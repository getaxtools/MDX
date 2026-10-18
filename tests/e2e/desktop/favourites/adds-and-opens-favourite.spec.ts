import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('favourites', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('stars the active document from the toolbar and lists it in the sidebar', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md']);

    await mainWindow.toggleFavourite();

    await mainWindow.waitForFavourites(['getting-started.md']);
    expect(await mainWindow.isActiveTabFavourite()).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('stars and unstars the active document with Ctrl+D', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md']);

    await mainWindow.pressShortcut('Ctrl+D');
    await mainWindow.waitForFavourites(['getting-started.md']);
    await mainWindow.pressShortcut('Ctrl+D');

    await mainWindow.waitForFavourites([]);
    expect(await mainWindow.isActiveTabFavourite()).toBe(false);
  });

  it('opens a favourite from the sidebar after a restart', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['release-notes.md'] });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.waitForTabs(['release-notes.md']);
    await firstRun.toggleFavourite();
    await firstRun.closeTab('release-notes.md');
    await app.browser.waitUntil(
      () => workspace.savedFavouriteFileNames()?.length === 1 && workspace.savedTabFileNames()?.length === 0,
    );
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);
    await secondRun.waitForFavourites(['release-notes.md']);
    await secondRun.openFavourite('release-notes.md');

    await secondRun.waitForTabs(['release-notes.md']);
    expect(await secondRun.documentHeading()).toBe('Release notes');
  });
});
