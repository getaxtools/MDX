import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('the Explorer folder tree', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    workspace.saveDocumentsFolder({ inExplorer: true });
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('moves through the tree with the arrow keys and opens a document with Enter', async () => {
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
    await mainWindow.focusExplorerFolder('documents');

    await mainWindow.pressShortcut('ArrowDown');
    await mainWindow.pressShortcut('ArrowDown');
    await mainWindow.pressShortcut('ArrowDown');
    expect(await mainWindow.focusedTreeItemName()).toBe('gfm-showcase.md');
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForActiveTab('gfm-showcase.md');
  });

  it('highlights the active document in the folder that holds it', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['math.md'] });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForSelectedExplorerEntry('math.md');
  });
});
