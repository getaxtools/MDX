import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'list.md';

describe('several cursors', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), 'one\ntwo\nthree\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs([DOCUMENT]);
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Ctrl+Alt+Down twice then typing edits three lines', async () => {
    await app.browser.$('[role="textbox"][aria-label^="Source of"]').click();
    await mainWindow.pressShortcut('Ctrl+Home');
    await mainWindow.pressShortcut('Ctrl+Alt+ArrowDown');
    await mainWindow.pressShortcut('Ctrl+Alt+ArrowDown');
    await mainWindow.waitForStatusBarText('3 cursors');

    await app.browser.execute(() => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- still the only way to insert text as an input method does
      document.execCommand('insertText', false, '- ');
    });

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe('- one\n- two\n- three\n');
  });
});
