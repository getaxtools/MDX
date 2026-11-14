import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const SECOND_OPEN_BUDGET_MS = 100;

describe('Control wheel shortcut', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let controlWheel: ControlWheelPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    mainWindow = new MainWindowPage(app.browser);
    controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('the shortcut opens the wheel with the focus on the active kind', async () => {
    await controlWheel.openControlWheel();

    expect(await controlWheel.wheelSegmentNames()).toEqual(['Markdown viewer']);
    expect(await controlWheel.focusedSegmentName()).toBe('Markdown viewer');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('Esc closes the wheel and returns the focus to the document', async () => {
    await app.browser.execute(() => document.querySelector('main')?.focus());
    await controlWheel.openControlWheel();

    await controlWheel.pressInWheel('Escape');

    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    expect(await app.browser.execute(() => document.activeElement?.tagName)).toBe('MAIN');
  });

  it('a second open is shown within 100 ms', async () => {
    await controlWheel.openControlWheel();
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));

    const openingMs = await app.browser.execute(
      () =>
        new Promise<number>((resolve) => {
          const startedAt = performance.now();
          const shortcut = { key: ' ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true };
          document.body.dispatchEvent(new KeyboardEvent('keydown', shortcut));
          function waitForWheel() {
            if (document.querySelector('[role="menuitemradio"]')) resolve(performance.now() - startedAt);
            else requestAnimationFrame(waitForWheel);
          }
          waitForWheel();
        }),
    );

    expect(openingMs).toBeLessThan(SECOND_OPEN_BUDGET_MS);
  });
});
