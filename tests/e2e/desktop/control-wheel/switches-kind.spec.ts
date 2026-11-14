import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

// The UI test build lets planned kinds be chosen, so switching is tested before Notes is built.
describe('Switching workspace kind', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let controlWheel: ControlWheelPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.emptyStateText();
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('choosing a segment switches kind', async () => {
    await controlWheel.chooseWheelSegment('Notes');

    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'notes');
    expect(await app.browser.$('main h1').getText()).toBe('Notes');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('pressing 2 in the wheel switches kind', async () => {
    await controlWheel.pressInWheel('Tab');
    await controlWheel.pressInWheel('2');

    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    await controlWheel.openControlWheel();
    expect(await controlWheel.checkedSegmentName()).toBe('Notes');
  });

  it('the kind bar switches kind and shows it pressed', async () => {
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));

    await controlWheel.chooseKindInBar('Notes');

    await app.browser.waitUntil(async () => (await controlWheel.pressedKindInBar()) === 'Notes');
    expect(await app.browser.$('main h1').getText()).toBe('Notes');
  });
});
