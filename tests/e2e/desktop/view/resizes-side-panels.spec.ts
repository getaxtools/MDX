import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DEFAULT_EXPLORER_WIDTH_PX = 260;

describe('resizing the side panels', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp | undefined;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app?.quit();
    workspace.remove();
  });

  it('keeps the Explorer as wide as it was dragged after a restart', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const firstRun = new MainWindowPage(app.browser);
    await firstRun.documentHeading();
    expect(await firstRun.splitterValue('sidebar.resize')).toBe(DEFAULT_EXPLORER_WIDTH_PX);

    await firstRun.dragSplitter('sidebar.resize', 100);
    await app.browser.waitUntil(
      () => workspace.savedPanelWidthOf('explorer') === DEFAULT_EXPLORER_WIDTH_PX + 100,
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    const secondRun = new MainWindowPage(app.browser);
    await secondRun.documentHeading();

    expect(await secondRun.splitterValue('sidebar.resize')).toBe(DEFAULT_EXPLORER_WIDTH_PX + 100);
  });

  it('narrows the side bar showing the Outline with the arrow keys and restores it with a double-click', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.pressShortcut('Ctrl+Shift+O');
    const splitter = mainWindow.splitter('sidebar.resize');

    await mainWindow.pressKeyOn(splitter, 'ArrowLeft');
    await app.browser.waitUntil(
      async () => (await mainWindow.splitterValue('sidebar.resize')) === DEFAULT_EXPLORER_WIDTH_PX - 16,
    );
    await mainWindow.doubleClick(splitter);

    await app.browser.waitUntil(
      async () => (await mainWindow.splitterValue('sidebar.resize')) === DEFAULT_EXPLORER_WIDTH_PX,
    );
  });
});
