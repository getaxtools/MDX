import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('restoring tabs after a restart', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('reopens the same tabs with the same active tab', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.waitForTabs(['getting-started.md', 'release-notes.md']);
    await firstRun.activateTab('getting-started.md');
    await app.browser.waitUntil(() => workspace.savedActiveTabFileName() === 'getting-started.md');
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);

    await secondRun.waitForTabs(['getting-started.md', 'release-notes.md']);
    expect(await secondRun.activeTabName()).toBe('getting-started.md');
    expect(await secondRun.documentHeading()).toBe('Getting started');
  });

  it('starts empty when the saved tabs were all closed', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.waitForTabs(['getting-started.md']);
    await firstRun.closeTab('getting-started.md');
    await app.browser.waitUntil(() => workspace.savedTabFileNames()?.length === 0);
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);

    expect(await secondRun.emptyStateText()).toContain('Open a Markdown document');
    expect(await secondRun.tabNames()).toEqual([]);
  });
});
