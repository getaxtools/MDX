import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DEFAULT_EXPLORER_WIDTH_PX = 260;
const DEFAULT_OUTLINE_WIDTH_PX = 256;

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

  it('narrows the Outline with the arrow keys and returns it to its width with a double-click', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    const splitter = mainWindow.splitter('outline.resize');

    await mainWindow.pressKeyOn(splitter, 'ArrowRight');
    await app.browser.waitUntil(
      async () => (await mainWindow.splitterValue('outline.resize')) === DEFAULT_OUTLINE_WIDTH_PX - 16,
    );
    await mainWindow.doubleClick(splitter);

    await app.browser.waitUntil(
      async () => (await mainWindow.splitterValue('outline.resize')) === DEFAULT_OUTLINE_WIDTH_PX,
    );
  });
});
