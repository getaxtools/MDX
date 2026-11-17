import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const SEARCH_WAIT_MS = 10_000;
const MOVE_WAIT_MS = 30_000;
/** Long enough per file to type while the move runs; the notes folder holds four files. */
const SLOW_MOVE_PAUSE_MS = 2_500;
const MOVING_STATUS = 'notes are read-only';

describe('moving the notes folder', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;
  let newFolder: string;

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function startWithNotes(environment: Readonly<Record<string, string>> = {}): Promise<void> {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    newFolder = join(workspace.homeDocumentsFolder, 'Moved Notes');
    mkdirSync(join(notesFolder, 'Trips'), { recursive: true });
    mkdirSync(newFolder);
    writeFileSync(join(notesFolder, 'Trips', 'Paris.md'), '# Paris\n\nCoffee with a quokka.\n');
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n\nSee [[Paris]].\n');
    app = await DesktopApp.launch({
      workspace,
      environment: { MDX_PICKED_FOLDER: newFolder, ...environment },
    });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
  }

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

  async function changeLocation(): Promise<void> {
    await mainWindow.pressShortcut('Ctrl+,');
    const section = app.browser.$('section[aria-labelledby="settings-section-notes"]');
    await section.waitForDisplayed();
    await section.$('button=Change Location…').click();
    await app.browser.$(`[role="alertdialog"]*=Move your notes to ${newFolder}?`).waitForDisplayed();
  }

  async function removalOffer() {
    const offer = app.browser.$(`[role="alertdialog"]*=Your notes are now in ${newFolder}`);
    await offer.waitForDisplayed({ timeout: MOVE_WAIT_MS });
    return offer;
  }

  async function searchUntilFound(query: string, expectedNotes: readonly string[]): Promise<void> {
    await mainWindow.pressShortcut('Ctrl+Shift+F');
    await app.browser.waitUntil(
      async () => {
        const found = await mainWindow.searchedDocumentNames(query);
        return JSON.stringify([...found].sort()) === JSON.stringify([...expectedNotes].sort());
      },
      { timeout: SEARCH_WAIT_MS },
    );
  }

  it('a move switches the workspace and search still works', async () => {
    await startWithNotes();
    await searchUntilFound('quokka', ['Paris.md']);
    await changeLocation();

    await app.browser.$('[role="alertdialog"]').$('button=Move Notes').click();
    const offer = await removalOffer();

    expect(await offer.getText()).toContain(`The old copy is still in ${notesFolder}`);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Escape');
    expect(readFileSync(join(newFolder, 'Trips', 'Paris.md'), 'utf8')).toBe(
      '# Paris\n\nCoffee with a quokka.\n',
    );
    expect(existsSync(join(newFolder, '.mdx-notes', 'notes-location.json'))).toBe(true);
    expect(existsSync(join(notesFolder, 'Plan.md'))).toBe(true);
    writeFileSync(join(newFolder, 'Trips', 'Rome.md'), '# Rome\n\nAnother quokka.\n');
    await searchUntilFound('quokka', ['Paris.md', 'Rome.md']);
    await mainWindow.pressShortcut('Ctrl+,');
    const settings = app.browser.$('section[aria-labelledby="settings-section-notes"]');
    expect((await settings.getText()).toLowerCase()).toContain(newFolder.toLowerCase());
    expect(await mainWindow.windowTitle()).toBe('Journal - MDX');
  });

  it('typing is refused during a move', async () => {
    await startWithNotes({ MDX_MOVE_FILE_PAUSE_MS: String(SLOW_MOVE_PAUSE_MS) });
    await (await mainWindow.treeItem('notes.tree.title', 'Plan')).click();
    await mainWindow.waitForDocumentHeading('Plan');
    await mainWindow.startEditing();
    await changeLocation();
    await app.browser.$('[role="alertdialog"]').$('button=Move Notes').click();
    await mainWindow.waitForStatusBarText(MOVING_STATUS);

    await mainWindow.typeAtEndOfDocument(' typed during the move');

    const editorText = await app.browser.$('[role="textbox"][aria-label^="Source of"]').getText();
    expect(editorText).not.toContain('typed during the move');
    expect(await mainWindow.statusBarText()).toContain(MOVING_STATUS);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await removalOffer();
    await mainWindow.pressShortcut('Escape');
    expect(readFileSync(join(notesFolder, 'Plan.md'), 'utf8')).toBe('# Plan\n\nSee [[Paris]].\n');
  });
});
