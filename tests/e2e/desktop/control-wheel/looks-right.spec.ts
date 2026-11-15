import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const MIN_SURFACE_OPACITY = 0.9;
const OPEN_MOTION_BUDGET_MS = 200;
const EDGE_BAND_CLICK_PX = 12;

// The UI test build lets planned kinds be chosen, so the wheel shows Markdown viewer and Notes.
describe('Control wheel look and motion', () => {
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
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('the wheel surface is blurred and at least 90% opaque', async () => {
    await controlWheel.openControlWheel();

    const surface = await controlWheel.surfaceStyle();

    if (surface.isTransparencyReduced) {
      expect(surface.backgroundOpacity).toBe(1);
      expect(surface.backdropFilter).toBe('none');
    } else {
      expect(surface.backgroundOpacity).toBeGreaterThanOrEqual(MIN_SURFACE_OPACITY);
      expect(surface.backdropFilter).toContain('blur(');
    }
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('pointing at a segment lights it', async () => {
    await controlWheel.openControlWheel();
    expect(await controlWheel.litSegmentNames()).toEqual(['Markdown viewer']);

    await controlWheel.pointAtSegment('Notes');

    expect(await controlWheel.litSegmentNames()).toEqual(['Notes']);
    expect(await controlWheel.captionText()).toContain('Notes');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a click just beyond the outer edge chooses that segment', async () => {
    await controlWheel.openControlWheel();

    await controlWheel.clickBeyondOuterEdge('Notes', EDGE_BAND_CLICK_PX);

    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    await app.browser.waitUntil(() => workspace.savedWorkspaceKinds()?.activeKindId === 'notes');
  });

  it('the open motion finishes within 200 milliseconds', async (context) => {
    if (await controlWheel.isMotionReduced()) context.skip('The system asks for reduced motion');

    const openingMs = await controlWheel.openMotionMs();

    expect(openingMs).toBeLessThanOrEqual(OPEN_MOTION_BUDGET_MS);
  });

  it('choosing switches kind before the wheel finishes closing', async (context) => {
    if (await controlWheel.isMotionReduced()) context.skip('The system asks for reduced motion');
    await controlWheel.openControlWheel();

    const { switchedAtMs, removedAtMs } = await controlWheel.chooseSegmentAndTimeTheClose('Notes');

    expect(switchedAtMs).toBeLessThanOrEqual(removedAtMs);
    expect(Number.isFinite(switchedAtMs)).toBe(true);
  });
});
