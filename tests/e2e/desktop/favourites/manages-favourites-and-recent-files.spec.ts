import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('managing favourites and recent files', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function starDocuments(fileNames: readonly string[]) {
    app = await DesktopApp.launch({ workspace, documentFileNames: fileNames });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(fileNames);
    for (const fileName of fileNames) {
      await mainWindow.activateTab(fileName);
      await mainWindow.waitForActiveTab(fileName);
      await mainWindow.toggleFavourite();
    }
    await mainWindow.waitForFavourites(fileNames);
  }

  async function focus(sectionTitleKey: 'favourites.sidebar.title' | 'recentFiles.title', name: string) {
    const row = await mainWindow.treeItem(sectionTitleKey, name);
    const resolvedRow = await row.getElement();
    await app.browser.execute((element) => {
      element.focus();
    }, resolvedRow);
  }

  it('renames a favourite with F2', async () => {
    await starDocuments(['getting-started.md']);
    await focus('favourites.sidebar.title', 'getting-started.md');

    await mainWindow.pressShortcut('F2');
    const nameInput = app.browser.$('nav input');
    await nameInput.waitForDisplayed();
    await nameInput.setValue('Team guide');
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForFavourites(['Team guide']);
  });

  it('moves a favourite down with Alt+Down', async () => {
    await starDocuments(['getting-started.md', 'release-notes.md']);
    await focus('favourites.sidebar.title', 'getting-started.md');

    await mainWindow.pressShortcut('Alt+ArrowDown');

    await mainWindow.waitForFavourites(['release-notes.md', 'getting-started.md']);
  });

  it('puts a favourite into a new group', async () => {
    await starDocuments(['getting-started.md']);

    await app.browser.$('button[aria-label="Favourites actions"]').click();
    await mainWindow.chooseMenuItem('favourites.group.new');
    const groupNameInput = app.browser.$('nav input');
    await groupNameInput.waitForDisplayed();
    await groupNameInput.setValue('Work');
    await mainWindow.pressShortcut('Enter');
    await mainWindow.openContextMenuOn(
      await mainWindow.treeItem('favourites.sidebar.title', 'getting-started.md'),
    );
    await mainWindow.chooseMenuItem('favourites.group.moveTo', { name: 'Work' });

    await mainWindow.waitForFavourites(['Work', 'getting-started.md']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('marks a favourite whose file was deleted, without removing it', async () => {
    await starDocuments(['getting-started.md', 'release-notes.md']);

    rmSync(workspace.documentPath('release-notes.md'));

    await mainWindow.waitForFavourites(['getting-started.md', 'release-notes.md (not found)']);
  });

  it('pins, removes and clears recent files from their context menu', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md', 'math.md'],
    });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md', 'math.md']);

    await mainWindow.openContextMenuOn(await mainWindow.treeItem('recentFiles.title', 'getting-started.md'));
    await mainWindow.chooseMenuItem('recentFiles.pin');
    await mainWindow.openContextMenuOn(await mainWindow.treeItem('recentFiles.title', 'math.md'));
    await mainWindow.chooseMenuItem('recentFiles.remove');
    await app.browser.waitUntil(async () => !(await mainWindow.recentFileNames()).includes('math.md'));
    await mainWindow.openContextMenuOn(await mainWindow.treeItem('recentFiles.title', 'release-notes.md'));
    await mainWindow.chooseMenuItem('recentFiles.clearUnpinned');

    await app.browser.waitUntil(async () => (await mainWindow.recentFileNames()).length === 1);
    expect(await mainWindow.recentFileNames()).toEqual(['getting-started.md 📌']);
  });

  it('adds a folder opened in the Explorer to the favourites', async () => {
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);

    await mainWindow.openContextMenuOn(await mainWindow.treeItem('explorer.folders.title', 'documents'));
    await mainWindow.chooseMenuItem('explorer.folders.addToFavourites');

    await mainWindow.waitForFavourites(['documents']);
  });
});
