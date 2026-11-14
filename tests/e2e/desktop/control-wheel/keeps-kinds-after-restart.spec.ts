import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('Workspace kinds after a restart', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('state survives a restart', async () => {
    app = await DesktopApp.launch({ workspace });
    let mainWindow = new MainWindowPage(app.browser);
    let controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.emptyStateText();
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.chooseWheelSegment('Notes');
    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser.$('[role="dialog"]').waitForDisplayed();
    await mainWindow.chooseOption('[role="dialog"] select#setting-wheelDock', 'bottomInlineStart');
    const changeButton = await app.browser.$('[role="dialog"] button[aria-pressed]').getElement();
    await app.browser.execute((button) => {
      button.click();
      button.focus();
    }, changeButton);
    await mainWindow.pressShortcut('Ctrl+Shift+J');
    await app.browser.waitUntil(() => workspace.savedShortcutOverrides()?.toggleControlWheel?.length === 3);
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.emptyStateText();
    await controlWheel.openControlWheel('Ctrl+Shift+J');

    expect(await controlWheel.checkedSegmentName()).toBe('Notes');
    expect(workspace.savedWorkspaceKinds()).toEqual({
      enabledKindIds: ['markdownViewer', 'notes'],
      activeKindId: 'notes',
    });
    expect(workspace.savedWheelDock()).toBe('bottomInlineStart');
    expect(workspace.savedShortcutOverrides()).toEqual({ toggleControlWheel: ['ctrl', 'shift', 'J'] });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a state saved before kinds existed keeps its tabs and favourites and starts with Markdown viewer only', async () => {
    workspace.saveStateWithoutKinds('getting-started.md');

    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    const controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.waitForTabs(['getting-started.md']);
    await mainWindow.waitForFavourites(['getting-started.md']);
    await controlWheel.openControlWheel();

    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer']);
  });
});
