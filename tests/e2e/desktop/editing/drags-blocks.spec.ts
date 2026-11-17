import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'drag.md';

describe('dragging blocks in Rich text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), 'Alpha first.\n\nBravo second.\n\nCharlie third.\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs([DOCUMENT]);
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+Home');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('drag a paragraph below another', async () => {
    const handle = app.browser.$('button[aria-label="Actions for the paragraph starting “Alpha first.”"]');
    await handle.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await app.browser.execute(
      (target) => {
        const lastLine = [...document.querySelectorAll('.cm-line')].find(
          (line) => line.textContent === 'Charlie third.',
        );
        const from = target.getBoundingClientRect();
        const toY = (lastLine?.getBoundingClientRect().bottom ?? from.bottom) + 4;
        const x = from.left + from.width / 2;
        // A synthetic pointer is not an active pointer, so it cannot be captured.
        target.setPointerCapture = () => undefined;
        const press = { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x };
        target.dispatchEvent(new PointerEvent('pointerdown', { ...press, clientY: from.top + 4 }));
        target.dispatchEvent(new PointerEvent('pointermove', { ...press, clientY: toY }));
        target.dispatchEvent(new PointerEvent('pointerup', { ...press, clientY: toY }));
      },
      await handle.getElement(),
    );
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      'Bravo second.\n\nCharlie third.\n\nAlpha first.\n',
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
