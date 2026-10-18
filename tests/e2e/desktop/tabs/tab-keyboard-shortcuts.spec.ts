import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

const THREE_DOCUMENTS = ['getting-started.md', 'release-notes.md', 'gfm-showcase.md'];

describe('tab keyboard shortcuts', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: THREE_DOCUMENTS });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(THREE_DOCUMENTS);
    await mainWindow.waitForActiveTab('gfm-showcase.md');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('moves to the next tab with Ctrl+Tab, wrapping to the first', async () => {
    await mainWindow.pressShortcut('Ctrl+Tab');

    await mainWindow.waitForActiveTab('getting-started.md');
  });

  it('moves to the previous tab with Ctrl+Shift+Tab', async () => {
    await mainWindow.pressShortcut('Ctrl+Shift+Tab');

    await mainWindow.waitForActiveTab('release-notes.md');
  });

  it('jumps to a tab by number with Ctrl+1', async () => {
    await mainWindow.pressShortcut('Ctrl+1');

    await mainWindow.waitForActiveTab('getting-started.md');
  });

  it('closes the active tab with Ctrl+W and reopens it with Ctrl+Shift+T', async () => {
    await mainWindow.pressShortcut('Ctrl+W');
    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);

    await mainWindow.pressShortcut('Ctrl+Shift+T');

    await mainWindow.waitForTabs(THREE_DOCUMENTS);
    expect(await mainWindow.activeTabName()).toBe('gfm-showcase.md');
  });

  it('closes a tab with its close button', async () => {
    await mainWindow.closeTab('release-notes.md');

    await mainWindow.waitForTabs(['getting-started.md', 'gfm-showcase.md']);
  });
});
