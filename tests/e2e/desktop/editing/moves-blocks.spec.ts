import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'blocks.md';

describe('moving blocks in the editor', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Title\r\n\r\nFirst.\r\n\r\nSecond.\r\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Alt+Shift+Down moves a paragraph and is announced', async () => {
    await app.browser.$('[role="textbox"][aria-label^="Source of"]').click();
    await mainWindow.pressShortcut('Ctrl+Home');
    await mainWindow.pressShortcut('ArrowDown');
    await mainWindow.pressShortcut('ArrowDown');

    await mainWindow.pressShortcut('Alt+Shift+ArrowDown');

    await app.browser.waitUntil(
      async () =>
        (await app.browser.execute(() => document.querySelector('.cm-announced')?.textContent ?? '')) ===
        'Moved paragraph down.',
      { timeoutMsg: 'The move was never announced' },
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Title\r\n\r\nSecond.\r\n\r\nFirst.\r\n',
    );
  });
});
