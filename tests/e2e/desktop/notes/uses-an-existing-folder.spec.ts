import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const OTHER_APP_SETTINGS = '{"theme":"dark"}';

describe('using an existing notes folder', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, '.other-app'), { recursive: true });
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\r\n\r\nSee [[Ideas]] first.\r\n');
    writeFileSync(join(notesFolder, 'Ideas.md'), '# Ideas\n\nShip it.\n');
    writeFileSync(join(notesFolder, '.other-app', 'settings.json'), OTHER_APP_SETTINGS);
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function turnOnNotes(): Promise<void> {
    const controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
  }

  it("an existing folder's wiki-links resolve", async () => {
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue('Journal');
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    const agreement = dialog.$('input[type="checkbox"][aria-describedby="notes-existing-files"]');
    await agreement.waitForDisplayed();
    expect(await agreement.isSelected()).toBe(false);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.confirmNotesFolder({ holdsFiles: true });
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Journal - MDX');

    await (await mainWindow.treeItem('notes.tree.title', 'Plan')).click();
    await mainWindow.waitForActiveTab('Plan.md');
    await mainWindow.clickDocumentLink('Ideas');

    await mainWindow.waitForActiveTab('Ideas.md');
    expect(readdirSync(notesFolder).sort()).toEqual(['.mdx-notes', '.other-app', 'Ideas.md', 'Plan.md']);
    expect(readFileSync(join(notesFolder, 'Plan.md'), 'utf8')).toBe('# Plan\r\n\r\nSee [[Ideas]] first.\r\n');
    expect(readFileSync(join(notesFolder, '.other-app', 'settings.json'), 'utf8')).toBe(OTHER_APP_SETTINGS);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
