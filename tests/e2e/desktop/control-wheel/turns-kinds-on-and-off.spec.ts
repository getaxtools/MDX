import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('Turning workspace kinds on and off', () => {
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
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('turning a kind off in the gear popup removes its segment', async () => {
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.setKindEnabled('Spec viewer', true);
    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer', 'Notes', 'Spec viewer']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await controlWheel.setKindEnabled('Notes', false);

    await app.browser.waitUntil(async () => (await controlWheel.wheelSegmentNames()).length === 2);
    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer', 'Spec viewer']);
  });

  it('the last enabled kind cannot be turned off and says why', async () => {
    const lastKind = await controlWheel.kindSwitchState('Markdown viewer');

    expect(lastKind).toEqual({ isChecked: true, isDisabled: true, reason: 'At least one kind stays on.' });
  });

  it('turning off the active kind shows the next kind and announces it', async () => {
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.chooseWheelSegment('Notes');
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'notes');
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();

    await controlWheel.setKindEnabled('Notes', false);

    await app.browser.$('//*[contains(text(), "Notes is off. Showing Markdown viewer.")]').waitForExist();
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'markdownViewer');
  });
});
