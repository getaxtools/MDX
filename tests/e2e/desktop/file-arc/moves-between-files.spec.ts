import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FileArcPage } from '../../pages/FileArcPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const ACTIVE_FILE = 'getting-started.md';
const LARGE_FOLDER_FILE_COUNT = 10_000;
const OPEN_BUDGET_MS = 100;
const HIDE_BUTTON = 'button[aria-label="Hide side bar"]';
const SHOW_BUTTON = 'button[aria-label="Show side bar"]';
const WHEEL_SETTING = 'select#setting-ctrlWheel';

describe('moving between files with the file arc', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let fileArc: FileArcPage;

  async function launch() {
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace, documentFileNames: [ACTIVE_FILE] });
    mainWindow = new MainWindowPage(app.browser);
    fileArc = new FileArcPage(app.browser);
    await mainWindow.waitForActiveTab(ACTIVE_FILE);
    await mainWindow.waitForDocumentHeading('Getting started');
    await app.browser
      .$(`.//div[@role="treeitem"][contains(normalize-space(.), "${ACTIVE_FILE}")]`)
      .waitForExist();
  }

  async function zoomShown(): Promise<string> {
    return /\d+%/.exec(await mainWindow.statusBarText())?.[0] ?? '';
  }

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('ctrl+down and letting go of ctrl opens the next file', async () => {
    workspace = TestWorkspace.create();
    await launch();

    await fileArc.holdControl();
    await fileArc.pressArrow('ArrowDown');
    await fileArc.waitForOpen();
    const highlighted = await fileArc.highlightedName();

    expect(highlighted).not.toBe(ACTIVE_FILE);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await fileArc.letGoOfControl();

    await mainWindow.waitForActiveTab(highlighted);
    await fileArc.waitForClosed();
    expect(await mainWindow.tabNames()).toEqual([ACTIVE_FILE, highlighted]);
  });

  it('esc keeps the current file', async () => {
    workspace = TestWorkspace.create();
    await launch();

    await fileArc.holdControl();
    await fileArc.pressArrow('ArrowDown');
    await fileArc.waitForOpen();
    await fileArc.pressWithControl('Escape');
    await fileArc.letGoOfControl();

    await fileArc.waitForClosed();
    expect(await mainWindow.tabNames()).toEqual([ACTIVE_FILE]);
    expect(await mainWindow.activeTabName()).toBe(ACTIVE_FILE);
  });

  it('ctrl and the wheel open the arc without zooming', async () => {
    workspace = TestWorkspace.create();
    await launch();
    const zoomBefore = await zoomShown();

    await fileArc.holdControl();
    const isDefaultKept = await fileArc.turnWheelOverDocument(100);
    await fileArc.waitForOpen();

    expect(isDefaultKept).toBe(false);
    expect(await zoomShown()).toBe(zoomBefore);
    await fileArc.pressWithControl('Escape');
    await fileArc.letGoOfControl();
  });

  it('zooms brings back wheel zoom', async () => {
    workspace = TestWorkspace.create();
    await launch();
    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser.$(WHEEL_SETTING).waitForDisplayed();
    await mainWindow.chooseOption(WHEEL_SETTING, 'zoom');
    await mainWindow.pressShortcut('Escape');
    await app.browser.$(WHEEL_SETTING).waitForExist({ reverse: true });

    await fileArc.holdControl();
    await fileArc.turnWheelOverDocument(-100);
    await fileArc.letGoOfControl();

    await mainWindow.waitForStatusBarText('110%');
    expect(await fileArc.isOpen()).toBe(false);
  });

  it('the arc opens quickly over a large folder', async () => {
    workspace = TestWorkspace.create();
    for (let index = 0; index < LARGE_FOLDER_FILE_COUNT; index += 1)
      writeFileSync(
        workspace.documentPath(`note-${String(index).padStart(5, '0')}.md`),
        `# Note ${String(index)}`,
      );
    await launch();
    await app.browser.$(HIDE_BUTTON).click();
    await app.browser.$(SHOW_BUTTON).waitForDisplayed();

    await fileArc.holdControl();
    await fileArc.pressArrow('ArrowDown');
    await fileArc.waitForOpen();
    await fileArc.pressWithControl('Escape');
    await fileArc.waitForClosed();
    const secondOpenMs = await fileArc.timeToOpenMs();

    expect(secondOpenMs).toBeLessThan(OPEN_BUDGET_MS);
    await fileArc.pressWithControl('Escape');
    await fileArc.letGoOfControl();
  });
});
