import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'toolbox.md';

describe('the Formatting toolbar', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Toolbox\n\nplan\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Toolbox');
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Bold button wraps a selection and the editor keeps focus', async () => {
    await mainWindow.pressShortcut('Ctrl+End');
    await mainWindow.pressShortcut('ArrowLeft');
    await mainWindow.pressShortcut('Shift+Home');
    const toolbar = app.browser.$('[role="toolbar"][aria-label="Formatting"]');
    await toolbar.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await toolbar.$('button[aria-label="Bold"]').click();
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe('# Toolbox\n\n**plan**\n');
    expect((await mainWindow.editorState()).hasFocus).toBe(true);
  });
});
