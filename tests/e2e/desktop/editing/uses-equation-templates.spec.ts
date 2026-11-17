import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'templates.md';
const EQUATION_DIALOG = '[role="dialog"][aria-labelledby="equation-dialog-title"]';
const GROUPS_BEFORE_COMMON_FORMULAS = 6;

describe('the equation template gallery', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Templates\n\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Templates');
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+End');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('choosing the quadratic formula from the keyboard writes it as a display formula', async () => {
    await mainWindow.pressShortcut('Ctrl+Shift+M');
    const equation = app.browser.$(EQUATION_DIALOG);
    await equation.waitForDisplayed();
    await mainWindow.pressWithPointer(equation.$('button=Templates'));
    const firstTemplate = app.browser.$('[role="grid"] [role="gridcell"][title="Fraction"]');
    await firstTemplate.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await app.browser.execute((cell) => cell.focus(), await firstTemplate.getElement());
    for (let group = 0; group < GROUPS_BEFORE_COMMON_FORMULAS; group += 1)
      await mainWindow.pressShortcut('ArrowDown');
    await mainWindow.pressShortcut('Enter');
    await mainWindow.pressShortcut('Ctrl+Enter');

    await equation.waitForExist({ reverse: true });
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Templates\n\n$$\n' + String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}` + '\n$$',
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
