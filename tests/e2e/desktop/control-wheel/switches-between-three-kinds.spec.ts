import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const GEAR = 'Choose workspace kinds';

describe('Markdown viewer, Notes and Spec viewer', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let controlWheel: ControlWheelPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.emptyStateText();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function kindBarNames(): Promise<string[]> {
    const names = await controlWheel
      .kindBar()
      .$$('button')
      .map(async (button) => (await button.getAttribute('aria-label')) ?? '');
    return names.filter((name) => name !== GEAR);
  }

  async function paletteKindSwitches(): Promise<string[]> {
    await mainWindow.searchInCommandPalette('>Workspace Kind:');
    const options = app.browser.$$('[role="dialog"] li[role="option"]');
    const labels = await options.map(async (option) => (await option.getText()).trim());
    await mainWindow.pressShortcut('Escape');
    return labels.filter((label) => label.startsWith('Workspace Kind:'));
  }

  async function setKinds(changes: Readonly<Record<string, boolean>>): Promise<void> {
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    for (const [name, isEnabled] of Object.entries(changes))
      await controlWheel.setKindEnabled(name, isEnabled);
  }

  async function closeWheel(): Promise<void> {
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
  }

  it('turning kinds on offers them everywhere in order, and turning them off takes them away', async () => {
    await controlWheel.openControlWheel();
    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer']);
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));

    await setKinds({ Notes: true, 'Spec viewer': true });
    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer', 'Notes', 'Spec viewer']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await closeWheel();

    expect(await kindBarNames()).toEqual(['Markdown viewer', 'Notes', 'Spec viewer']);
    expect(await paletteKindSwitches()).toEqual(['Workspace Kind: Notes', 'Workspace Kind: Spec viewer']);

    await setKinds({ Notes: false });
    await app.browser.waitUntil(async () => (await controlWheel.wheelSegmentNames()).length === 2);
    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer', 'Spec viewer']);
    await closeWheel();

    expect(await kindBarNames()).toEqual(['Markdown viewer', 'Spec viewer']);
    expect(await paletteKindSwitches()).toEqual(['Workspace Kind: Spec viewer']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('turning off the active kind shows the next one, wraps to the first, and keeps the last one on', async () => {
    await setKinds({ Notes: true, 'Spec viewer': true });
    await controlWheel.pressInWheel('Escape');
    await controlWheel.chooseWheelSegment('Notes');
    await mainWindow.waitForNotice('workspaceKinds.notice.shown', { kind: 'Notes' });

    await setKinds({ Notes: false });
    await mainWindow.waitForNotice('workspaceKinds.notice.turnedOffActive', {
      turnedOffKind: 'Notes',
      kind: 'Spec viewer',
    });
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'specViewer');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await controlWheel.setKindEnabled('Spec viewer', false);
    await mainWindow.waitForNotice('workspaceKinds.notice.turnedOffActive', {
      turnedOffKind: 'Spec viewer',
      kind: 'Markdown viewer',
    });
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'markdownViewer');

    expect(await controlWheel.kindSwitchState('Markdown viewer')).toEqual({
      isChecked: true,
      isDisabled: true,
      reason: 'At least one kind stays on.',
    });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('three kinds with Spec viewer active come back after a restart', async () => {
    await setKinds({ Notes: true, 'Spec viewer': true });
    await controlWheel.pressInWheel('Escape');
    await controlWheel.chooseWheelSegment('Spec viewer');
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'specViewer');
    await app.quit();

    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.emptyStateText();
    await controlWheel.openControlWheel();

    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer', 'Notes', 'Spec viewer']);
    expect(await controlWheel.checkedSegmentName()).toBe('Spec viewer');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
