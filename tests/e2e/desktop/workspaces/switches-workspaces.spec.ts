import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('switching workspaces', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['release-notes.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['release-notes.md']);
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function runFromPalette(label: string): Promise<void> {
    await mainWindow.searchInCommandPalette(`>${label}`);
    await mainWindow.waitForCommandPaletteOption(label);
    await mainWindow.pressShortcut('Enter');
  }

  it('create a workspace from the palette, switch to it and back', async () => {
    await runFromPalette('New Workspace…');
    const name = app.browser.$('[role="dialog"] input#workspace-name');
    await name.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await name.setValue('Handbook');
    await app.browser.$('[role="dialog"]').$('label*=Choose a folder').click();
    await app.browser.$('[role="dialog"]').$('button=Create').click();

    await mainWindow.waitForTabs([]);
    await runFromPalette('Workspace: Default');
    await mainWindow.waitForTabs(['release-notes.md']);
    await runFromPalette('Workspace: Handbook');

    await mainWindow.waitForTabs([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('restart restores the second workspace with its tabs', async () => {
    await runFromPalette('New Workspace…');
    const name = app.browser.$('[role="dialog"] input#workspace-name');
    await name.waitForDisplayed();
    await name.setValue('Handbook');
    await app.browser.$('[role="dialog"]').$('label*=Choose a folder').click();
    await app.browser.$('[role="dialog"]').$('button=Create').click();
    await mainWindow.waitForTabs([]);
    await app.quit();

    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForTabs(['getting-started.md']);
    await runFromPalette('Workspace: Default');
    await mainWindow.waitForTabs(['release-notes.md']);
  });
});
