import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('opening recent workspaces', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['release-notes.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['release-notes.md']);
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue('Handbook');
    await dialog.$('label*=Choose a folder').click();
    await dialog.$('button=Create').click();
    await mainWindow.waitForTabs([]);
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Ctrl+Alt+W switches workspace', async () => {
    await mainWindow.pressShortcut('Ctrl+Alt+W');
    const filter = app.browser.$('[role="dialog"] [role="combobox"]');
    await filter.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await filter.setValue('Def');
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForTabs(['release-notes.md']);
    expect(await mainWindow.windowTitle()).toBe('release-notes.md - Default - MDX');
  });

  it('the start page opens a recent workspace', async () => {
    const workspaces = app.browser.$('section[aria-labelledby="start-page-workspaces"]');
    await workspaces.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await workspaces.$('button=Default').click();

    await mainWindow.waitForTabs(['release-notes.md']);
  });

  it('the side bar header names the workspace and opens the switcher', async () => {
    const header = app.browser.$('button[aria-label^="Switch Workspace, now showing Handbook"]');
    await header.waitForDisplayed();

    await header.click();

    await app.browser.$('[role="dialog"] [role="combobox"]').waitForDisplayed();
    expect(await mainWindow.windowTitle()).toBe('Handbook - MDX');
  });
});
