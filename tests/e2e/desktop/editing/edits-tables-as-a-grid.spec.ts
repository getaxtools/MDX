import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'stock.md';
const TABLE_LINES = ['| Fruit | Count |', '|:------|------:|', '| Pear  |     2 |', '| Plum  |    10 |'];
const TEXT = ['# Stock', '', ...TABLE_LINES, '', 'End', ''].join('\n');

describe('tables in Rich text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), TEXT);
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Stock');
    await mainWindow.openEditor();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('edit a cell in the grid, save, only that cell changed in the file', async () => {
    await mainWindow.pressWithPointer(app.browser.$('.cm-rich-table td'));
    await app.browser.$('[role="grid"][aria-label="Table, 3 rows, 2 columns"]').waitForExist();
    await app.browser.waitUntil(async () =>
      app.browser.execute(() => document.querySelector('.cm-table-live-cell')?.textContent === 'Pear'),
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.typeInFocusedField('s|');
    await mainWindow.pressShortcut('ArrowDown');
    await mainWindow.typeInFocusedField('!');
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);

    const saved = readFileSync(workspace.documentPath(DOCUMENT), 'utf8').split('\n');
    expect(saved.slice(2, 6)).toEqual([
      TABLE_LINES[0],
      TABLE_LINES[1],
      '| Pears\\|  |     2 |',
      '| !Plum  |    10 |',
    ]);
    expect(await app.browser.$('[role="grid"]').isExisting()).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
