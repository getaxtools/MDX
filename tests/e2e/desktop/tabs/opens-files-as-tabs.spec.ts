import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('opening files as tabs', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('shows the empty state when started without a document', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);

    const emptyStateText = await mainWindow.emptyStateText();

    expect(emptyStateText).toContain('Open a Markdown document');
    expect(await mainWindow.tabNames()).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('opens every file from the command line in its own tab', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);

    expect(await mainWindow.activeTabName()).toBe('release-notes.md');
    expect(await mainWindow.documentHeading()).toBe('Release notes');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('shows the document of the tab the user selects', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
    });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);

    await mainWindow.activateTab('getting-started.md');

    await mainWindow.waitForActiveTab('getting-started.md');
    expect(await mainWindow.documentHeading()).toBe('Getting started');
  });

  it('opens a file passed to a second launch in the running window', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs(['getting-started.md']);

    await DesktopApp.launchSecondInstance({ workspace, documentFileNames: ['release-notes.md'] });

    await mainWindow.waitForTabs(['getting-started.md', 'release-notes.md']);
    expect(await mainWindow.activeTabName()).toBe('release-notes.md');
  });
});
