import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'paste.md';

/** Puts plain text on the Windows clipboard as another program would. */
function setClipboardText(text: string): void {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Set-Clipboard -Value '${text.replaceAll("'", "''")}'`,
  ]);
}

describe('Paste as Plain Text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

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
    setClipboardText(String.raw`Area \(x\)`);

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
