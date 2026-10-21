import { afterEach, beforeEach, describe, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('going back and forward between documents', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);
    await mainWindow.waitForActiveTab('release-notes.md');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('returns to the previous document with Alt+Left and comes back with Alt+Right', async () => {
    await mainWindow.pressShortcut('Alt+ArrowLeft');
    await mainWindow.waitForActiveTab('getting-started.md');

    await mainWindow.pressShortcut('Alt+ArrowRight');

    await mainWindow.waitForActiveTab('release-notes.md');
  });

  it('reopens a closed document when going back to it', async () => {
    await mainWindow.activateTab('getting-started.md');
    await mainWindow.closeTab('getting-started.md');
    await mainWindow.waitForTabs(['release-notes.md']);

    await mainWindow.pressShortcut('Alt+ArrowLeft');

    await mainWindow.waitForActiveTab('getting-started.md');
  });
});
