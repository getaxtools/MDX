import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('saved state from a newer version', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('keeps a copy, starts empty and names the newer version', async () => {
    const newerState = workspace.saveStateFromNewerVersion('9.0.0');

    app = await DesktopApp.launch({ workspace, documentFileNames: ['release-notes.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['release-notes.md']);
    await mainWindow.waitForNotice('errors.appState.newerVersion', { version: '9.0.0' });
    await app.browser.waitUntil(() => workspace.savedTabFileNames()?.length === 1);

    expect(workspace.newerVersionBackup()).toBe(newerState);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('Clear All Data removes the copy', async () => {
    workspace.saveStateFromNewerVersion('9.0.0');
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForNotice('errors.appState.newerVersion', { version: '9.0.0' });

    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser.$('[role="dialog"]').$('button*=Clear All Data').click();
    await app.browser.$('[role="alertdialog"]').$('button=Clear All Data').click();

    await mainWindow.waitForNotice('privacy.clearAllData.done', {});
    expect(workspace.newerVersionBackup()).toBeUndefined();
  });
});
