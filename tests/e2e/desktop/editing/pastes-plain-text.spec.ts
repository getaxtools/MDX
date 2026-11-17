import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';
import { WindowsClipboard } from '../../support/WindowsClipboard';

const DOCUMENT = 'paste.md';

describe('Paste as Plain Text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let clipboard: WindowsClipboard;

  beforeAll(() => {
    clipboard = WindowsClipboard.save();
  });

  afterAll(() => {
    clipboard.restore();
  });

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), 'Pasted: ');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForTabs([DOCUMENT]);
    await mainWindow.startEditing();
    await mainWindow.pressShortcut('Ctrl+End');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('Edit menu Paste as Plain Text inserts the plain text', async () => {
    clipboard.setText(String.raw`Area \(x\)`);

    // Native menus are out of reach of the driver; the palette runs the same command.
    await mainWindow.searchInCommandPalette('>Paste as Plain Text');
    await mainWindow.waitForCommandPaletteOption('Paste as Plain Text');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Enter');
    await mainWindow.waitForUnsavedTab(DOCUMENT);
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(String.raw`Pasted: Area \(x\)`);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
