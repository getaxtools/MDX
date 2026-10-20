import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FIXTURE_ENTRIES = [
  'getting-started.md',
  'gfm-showcase.md',
  'math.md',
  'README.md',
  'release-notes.md',
  'script-in-document.md',
];

describe('the Explorer', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('shows a folder opened earlier, expanded, with its Markdown documents', async () => {
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.waitForExplorerFolderEntries('documents', FIXTURE_ENTRIES);

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('lists documents added to an opened folder by other programs', async () => {
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForExplorerFolderEntries('documents', FIXTURE_ENTRIES);

    writeFileSync(workspace.documentPath('added-later.md'), '# Added later\n');

    await mainWindow.waitForExplorerFolderEntries('documents', ['added-later.md', ...FIXTURE_ENTRIES]);
  });

  it('keeps a collapsed section collapsed after a restart', async () => {
    app = await DesktopApp.launch({ workspace });
    await new MainWindowPage(app.browser).toggleExplorerSection('recentFiles.title');
    await app.browser.waitUntil(
      () => workspace.savedCollapsedExplorerSections()?.includes('recentFiles') === true,
    );
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);

    expect(await mainWindow.isExplorerSectionExpanded('recentFiles.title')).toBe(false);
    expect(await mainWindow.isExplorerSectionExpanded('favourites.sidebar.title')).toBe(true);
  });

  it('keeps a section at the height it was resized to after a restart', async () => {
    app = await DesktopApp.launch({ workspace });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.emptyStateText();
    const splitter = app.browser.$('[role="separator"][aria-label="Resize Favourites"]');
    await app.browser.execute(
      (element) => {
        element.focus();
      },
      await splitter.getElement(),
    );
    const keyPresses = 6;
    for (let press = 0; press < keyPresses; press += 1) await firstRun.pressShortcut('ArrowDown');
    await app.browser.waitUntil(() => (workspace.savedSectionHeightOf('favourites') ?? 0) > 0);
    const savedHeight = workspace.savedSectionHeightOf('favourites') ?? 0;
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    await new MainWindowPage(app.browser).emptyStateText();

    const slotHeight = await app.browser.execute(
      () => document.querySelector('.section-slot')?.getBoundingClientRect().height ?? 0,
    );
    expect(Math.round(slotHeight)).toBe(savedHeight);
  });
});
