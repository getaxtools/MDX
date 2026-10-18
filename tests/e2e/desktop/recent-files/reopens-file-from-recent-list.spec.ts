import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('recent files', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('lists opened documents, most recent first', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);

    expect(await mainWindow.recentFileNames()).toEqual(['release-notes.md', 'getting-started.md']);
  });

  it('reopens a closed document from the recent files list', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);
    await mainWindow.closeTab('getting-started.md');
    await mainWindow.waitForTabs(['release-notes.md']);

    await mainWindow.openRecentFile('getting-started.md');

    await mainWindow.waitForTabs(['release-notes.md', 'getting-started.md']);
    expect(await mainWindow.documentHeading()).toBe('Getting started');
  });
});
