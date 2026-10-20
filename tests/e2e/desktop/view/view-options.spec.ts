import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('view options', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('zooms the document with Ctrl+= and resets it with Ctrl+0', async () => {
    await mainWindow.pressShortcut('Ctrl+=');
    await mainWindow.waitForStatusBarText('110%');

    await mainWindow.pressShortcut('Ctrl+0');

    await mainWindow.waitForStatusBarText('100%');
  });

  it('shows the word count, encoding and line endings in the status bar', async () => {
    const statusBar = await mainWindow.statusBarText();

    expect(statusBar).toMatch(/\d+ words/);
    expect(statusBar).toContain('UTF-8');
    expect(statusBar).toMatch(/LF|CRLF/);
  });

  it('finds text in the document with Ctrl+F', async () => {
    await mainWindow.pressShortcut('Ctrl+F');
    const searchBox = app.browser.$('[role="search"] input');
    await searchBox.waitForDisplayed();

    await searchBox.setValue('document');

    await app.browser.waitUntil(async () =>
      /^1 of [1-9]/.test(await app.browser.$('[role="search"] [role="status"]').getText()),
    );
  });

  it('shows the Markdown source with Ctrl+U and goes back to the preview', async () => {
    await mainWindow.pressShortcut('Ctrl+U');
    await app.browser.$('main pre.source-view').waitForDisplayed();
    expect(await app.browser.$('main pre.source-view').getText()).toContain('# Getting started');

    await mainWindow.pressShortcut('Ctrl+U');

    await mainWindow.documentHeading();
  });

  it('switches to the dark theme from the command palette', async () => {
    await mainWindow.searchInCommandPalette('>theme dark');
    await mainWindow.waitForCommandPaletteOption('Theme: Dark');
    await mainWindow.pressShortcut('Enter');

    await app.browser.waitUntil(async () =>
      app.browser.execute(() => document.documentElement.dataset.theme === 'dark'),
    );
  });

  it('changes the reading width from the command palette', async () => {
    await mainWindow.searchInCommandPalette('>reading width full');
    await mainWindow.waitForCommandPaletteOption('Reading Width: Full Width');
    await mainWindow.pressShortcut('Enter');

    await app.browser.waitUntil(async () =>
      app.browser.execute(
        () => document.querySelector('main')?.style.getPropertyValue('--reading-measure') === 'none',
      ),
    );
  });
});
