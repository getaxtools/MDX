import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'math.md';
const EQUATION_DIALOG = '[role="dialog"][aria-labelledby="equation-dialog-title"]';

describe('formulas from the keyboard', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Math\n\nArea is ');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Math');
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+End');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Alt+= inserts a formula and it renders', async () => {
    await mainWindow.pressShortcut('Alt+=');
    const equation = app.browser.$(EQUATION_DIALOG);
    await equation.waitForDisplayed();
    await mainWindow.typeInFocusedField(String.raw`\pi r^2`);
    await app.browser.$('[role="group"][aria-label="Preview"] .katex').waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.pressShortcut('Enter');

    await equation.waitForExist({ reverse: true });
    expect((await mainWindow.editorState()).hasFocus).toBe(true);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      String.raw`# Math` + '\n\n' + String.raw`Area is $\pi r^2$`,
    );
    // The caret right after the formula shows its source; away from it, the formula renders.
    await mainWindow.pressShortcut('Ctrl+Home');
    // A backslash in a CSS attribute value is written twice.
    await app.browser.$(String.raw`[role="img"][aria-label="Formula \\pi r^2"] .katex`).waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('Ctrl+Shift+M from the keyboard to the inserted display formula', async () => {
    await mainWindow.pressShortcut('Ctrl+Shift+M');
    const equation = app.browser.$(EQUATION_DIALOG);
    await equation.waitForDisplayed();
    await mainWindow.typeInFocusedField(String.raw`\sum_{i=1}^n i`);

    await mainWindow.pressShortcut('Ctrl+Enter');

    await equation.waitForExist({ reverse: true });
    expect((await mainWindow.editorState()).hasFocus).toBe(true);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Math\n\nArea is \n$$\n' + String.raw`\sum_{i=1}^n i` + '\n$$',
    );
    await mainWindow.pressShortcut('Ctrl+Home');
    await app.browser.$(String.raw`[role="img"][aria-label="Formula \\sum_{i=1}^n i"]`).waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
