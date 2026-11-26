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

  it('create a workspace with an icon and colour', async () => {
    for (const theme of [
      { id: 'light', label: 'Light' },
      { id: 'highContrast', label: 'High Contrast' },
    ]) {
      await runFromPalette(`Theme: ${theme.label}`);
      await app.browser.waitUntil(async () =>
        app.browser.execute((id) => document.documentElement.dataset.theme === id, theme.id),
      );
      await runFromPalette('New Workspace…');
      const dialog = app.browser.$('[role="dialog"]');
      const name = dialog.$('input#workspace-name');
      await name.waitForDisplayed();
      const workspaceName = `${theme.label} handbook`;

      await name.setValue(workspaceName);
      await dialog.$('input[name="workspace-icon"][value="book"]').click();
      await dialog.$('input[name="workspace-colour"][value="blue"]').click();

      const preview = dialog.$('[role="group"][aria-label="Preview"]');
      expect(await preview.getText(), theme.label).toContain(workspaceName);
      expect(await preview.getText(), theme.label).toContain(
        'Markdown viewer - folders, recent files, favourites and tabs',
      );
      expect(await findAccessibilityViolations(app.browser), theme.label).toEqual([]);

      await dialog.$('label*=Choose a folder').click();
      await dialog.$('button=Create').click();
      await mainWindow.waitForTabs([]);
      await runFromPalette('Workspace: Default');
      await mainWindow.waitForTabs(['release-notes.md']);
      await mainWindow.searchInCommandPalette(`>Workspace: ${workspaceName}`);
      await mainWindow.waitForCommandPaletteOption(`Workspace: ${workspaceName}`);
      await mainWindow.pressShortcut('Escape');
    }
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
