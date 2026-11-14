import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const MISSING_HEADING = 'h1=Your notes folder is not available';

describe('a Notes workspace whose folder is missing', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;
  let movedFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    movedFolder = join(workspace.homeDocumentsFolder, 'MDX Notes (moved)');
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
    await app.quit();
    renameSync(notesFolder, movedFolder);
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
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

  async function createNotesWorkspace(name: string): Promise<void> {
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue(name);
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === `${name} - MDX`);
  }

  it('an unavailable location shows the three actions', async () => {
    const panel = app.browser.$('main[aria-labelledby="notes-location-missing-heading"]');
    await app.browser.$(MISSING_HEADING).waitForDisplayed();

    const buttons = await panel.$$('button').map((button) => button.getText());

    expect(buttons).toEqual(['Try Again', 'Locate Folder…', 'Choose Another Folder…']);
    expect((await panel.getText()).toLowerCase()).toContain(notesFolder.toLowerCase());
    expect(existsSync(notesFolder)).toBe(false);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('Try Again shows the notes once the folder is back', async () => {
    await app.browser.$(MISSING_HEADING).waitForDisplayed();
    renameSync(movedFolder, notesFolder);

    await app.browser.$('button=Try Again').click();

    await app.browser.$(MISSING_HEADING).waitForDisplayed({ reverse: true });
    expect(await mainWindow.windowTitle()).toBe('Journal - MDX');
  });
});
