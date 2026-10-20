import { rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENTS = ['getting-started.md', 'release-notes.md', 'math.md'];

describe('managing tabs', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  async function openDocuments() {
    app = await DesktopApp.launch({ workspace, documentFileNames: DOCUMENTS });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(DOCUMENTS);
    return mainWindow;
  }

  it('closes the other tabs from a tab’s context menu', async () => {
    const mainWindow = await openDocuments();

    await mainWindow.openContextMenuOn(mainWindow.tab('release-notes.md'));
    await mainWindow.chooseMenuItem('tabs.closeOthers');

    await mainWindow.waitForTabs(['release-notes.md']);
  });

  it('closes the tabs to the right from a tab’s context menu', async () => {
    const mainWindow = await openDocuments();

    await mainWindow.openContextMenuOn(mainWindow.tab('getting-started.md'));
    await mainWindow.chooseMenuItem('tabs.closeToTheRight');

    await mainWindow.waitForTabs(['getting-started.md']);
  });

  it('moves the active tab with Ctrl+Shift+PageUp', async () => {
    const mainWindow = await openDocuments();
    await mainWindow.waitForActiveTab('math.md');

    await mainWindow.pressShortcut('Ctrl+Shift+PageUp');

    await mainWindow.waitForTabs(['getting-started.md', 'math.md', 'release-notes.md']);
  });

  it('pins a tab, which moves it to the front', async () => {
    const mainWindow = await openDocuments();

    await mainWindow.openContextMenuOn(mainWindow.tab('math.md'));
    await mainWindow.chooseMenuItem('tabs.pin');

    await mainWindow.waitForTabs(['📌 math.md', 'getting-started.md', 'release-notes.md']);
  });

  it('marks a tab whose file was deleted by another program', async () => {
    const mainWindow = await openDocuments();

    rmSync(workspace.documentPath('release-notes.md'));

    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md (file not found)', 'math.md']);
  });

  it('reopens a document at the place it was scrolled to before a restart', async () => {
    const lines = Array.from(
      { length: 200 },
      (_, index) => `Paragraph ${String(index + 1)} of a long document.\n`,
    );
    writeFileSync(workspace.documentPath('long.md'), `# Long\n\n${lines.join('\n')}`);
    app = await DesktopApp.launch({ workspace, documentFileNames: ['long.md'] });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.documentHeading();
    await firstRun.scrollDocumentTo(0.5);
    await app.browser.waitUntil(() => (workspace.savedScrollRatioOf('long.md') ?? 0) > 0.4);
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);
    await secondRun.documentHeading();

    await app.browser.waitUntil(async () => (await secondRun.documentScrollTop()) > 0, {
      timeoutMsg: 'The document opened at the top',
    });
    expect(await secondRun.documentScrollTop()).toBeGreaterThan(0);
  });
});
