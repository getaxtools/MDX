import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('opening a file that is already open', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('focuses the existing tab instead of opening a duplicate', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForActiveTab('release-notes.md');

    await DesktopApp.launchSecondInstance({ workspace, documentFileNames: ['getting-started.md'] });

    await mainWindow.waitForActiveTab('getting-started.md');
    expect(await mainWindow.tabNames()).toEqual(['getting-started.md', 'release-notes.md']);
  });

  it('treats a differently cased path to the same file as the same document', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForActiveTab('release-notes.md');

    await DesktopApp.launchSecondInstance({ workspace, documentFileNames: ['GETTING-STARTED.md'] });

    await mainWindow.waitForActiveTab('getting-started.md');
    expect(await mainWindow.tabNames()).toEqual(['getting-started.md', 'release-notes.md']);
  });
});
