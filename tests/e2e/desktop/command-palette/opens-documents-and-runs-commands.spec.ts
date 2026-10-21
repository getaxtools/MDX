import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('the command palette', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('finds a document in an opened folder by name and opens it', async () => {
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForExplorerFolderEntries('documents', [
      'extended-syntax.md',
      'getting-started.md',
      'gfm-showcase.md',
      'math.md',
      'README.md',
      'release-notes.md',
      'script-in-document.md',
    ]);

    await mainWindow.searchInCommandPalette('relnot');
    await mainWindow.waitForCommandPaletteOption('release-notes.md');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForActiveTab('release-notes.md');
  });

  it('runs a command typed after >', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['README.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();

    await mainWindow.searchInCommandPalette('>explorer');
    await mainWindow.waitForCommandPaletteOption('Explorer');
    await mainWindow.pressShortcut('Enter');

    await app.browser.waitUntil(async () => !(await mainWindow.isExplorerVisible()));
  });
});
