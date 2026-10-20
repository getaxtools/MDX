import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('About', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows the version, the privacy promise and the feature list', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();

    await mainWindow.searchInCommandPalette('>about');
    await mainWindow.waitForCommandPaletteOption('About MDX');
    await mainWindow.pressShortcut('Enter');

    const dialog = app.browser.$('[role="dialog"]');
    await dialog.waitForDisplayed();
    const text = await dialog.getText();
    expect(text).toMatch(/Version \d+\.\d+\.\d+/);
    expect(text).toContain("MDX doesn't collect or send any data.");
    expect(text).toContain('Command palette that finds documents by name');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('lists the third-party packages and their licenses', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await mainWindow.searchInCommandPalette('>about');
    await mainWindow.waitForCommandPaletteOption('About MDX');
    await mainWindow.pressShortcut('Enter');

    await app.browser.$('[role="dialog"]').$('button=Third-party licenses').click();

    const summary = app.browser.$('[role="dialog"]').$('p*=open-source packages');
    await summary.waitForDisplayed();
    expect(await summary.getText()).toMatch(/MDX is built with \d{3} open-source packages\./);
    expect(await app.browser.$('[role="dialog"]').$('span=dompurify').isExisting()).toBe(true);
  });
});
