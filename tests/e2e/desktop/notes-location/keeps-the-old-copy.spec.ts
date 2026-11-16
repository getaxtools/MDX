import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const MOVE_WAIT_MS = 30_000;

describe('the old copy after moving the notes folder', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;
  let newFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    newFolder = join(workspace.homeDocumentsFolder, 'Moved Notes');
    mkdirSync(notesFolder);
    mkdirSync(newFolder);
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n');
    app = await DesktopApp.launch({ workspace, environment: { MDX_PICKED_FOLDER: newFolder } });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
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
    await mainWindow.confirmNotesFolder({ holdsFiles: true });
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === `${name} - MDX`);
  }

  it('Enter on the removal offer keeps the old copy', async () => {
    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser
      .$('section[aria-labelledby="settings-section-notes"]')
      .$('button=Change Location…')
      .click();
    await app.browser.$('[role="alertdialog"]').$('button=Move Notes').click();
    const offer = app.browser.$(`[role="alertdialog"]*=Your notes are now in ${newFolder}`);
    await offer.waitForDisplayed({ timeout: MOVE_WAIT_MS });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    const focused = await app.browser.execute(() => document.activeElement?.textContent ?? '');
    expect(focused).toBe('Keep the Old Copy');

    // The embedded driver sends synthetic key events, which never start a button's default action,
    // so the focused button is activated the way Enter activates it.
    await app.browser.execute(() => {
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
    });

    const kept = `The old copy of your notes is kept in ${notesFolder}.`.toLowerCase();
    const notice = app.browser.$('[role="status"][aria-live="polite"]');
    await app.browser.waitUntil(async () => (await notice.getText()).toLowerCase().includes(kept));
    expect(await offer.isExisting()).toBe(false);
    expect(readFileSync(join(notesFolder, 'Plan.md'), 'utf8')).toBe('# Plan\n');
    expect(existsSync(join(newFolder, 'Plan.md'))).toBe(true);
  });
});
