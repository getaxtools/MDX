import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FORMULA_DOCUMENT = 'formula.md';
const BLOCKS_DOCUMENT = 'blocks.md';
const BLOCKS_TEXT = [
  '---',
  'title: Blocks',
  'tags: [sample]',
  '---',
  '',
  '# Blocks',
  '',
  '> [!TIP]',
  '> Callouts keep their body as text.',
  '',
  '| A | B |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  'The end.',
  '',
].join('\n');
const BLOCKS_LINE_COUNT = BLOCKS_TEXT.split('\n').length;

describe('blocks in Rich text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    writeFileSync(
      workspace.documentPath(FORMULA_DOCUMENT),
      '# Formula\n\nIntro.\n\n$$\nE = mc^2\n$$\n\nEnd.\n',
    );
    writeFileSync(workspace.documentPath(BLOCKS_DOCUMENT), BLOCKS_TEXT);
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('a formula renders and shows its source when the caret enters', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [FORMULA_DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Formula');
    await mainWindow.openEditor();
    const formula = app.browser.$('[role="img"][aria-label="Formula E = mc^2"]');
    await formula.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await formula.click();

    await formula.waitForExist({ reverse: true });
    expect(await app.browser.$('[role="textbox"]').getText()).toContain('$$');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('moving through callouts, a table and front matter leaves no unsaved changes', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [BLOCKS_DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Blocks');
    await mainWindow.openEditor();
    await app.browser.$('table[aria-label="Table, 2 rows, 2 columns"]').waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.pressShortcut('Ctrl+Home');
    for (let line = 0; line < BLOCKS_LINE_COUNT; line += 1) await mainWindow.pressShortcut('ArrowDown');
    for (let line = 0; line < BLOCKS_LINE_COUNT; line += 1) await mainWindow.pressShortcut('ArrowUp');

    await mainWindow.waitForSavedTab(BLOCKS_DOCUMENT);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
