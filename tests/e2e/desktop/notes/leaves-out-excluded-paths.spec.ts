import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const SEARCH_WAIT_MS = 10_000;

describe('excluded paths in a Notes workspace', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    const notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Private'), { recursive: true });
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n\nThe weekly meeting.\n');
    writeFileSync(join(notesFolder, 'Private', 'Review.md'), '# Review\n\nThe meeting about salary.\n');
    app = await DesktopApp.launch({ workspace });
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

  /** Searches until exactly these notes are found, as the index builds in the background. */
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

  it('notes in an excluded folder leave search', async () => {
    await searchUntilFound('meeting', ['Plan.md', 'Review.md']);

    await mainWindow.pressShortcut('Ctrl+,');
    const field = app.browser.$('[role="dialog"] textarea#settings-notes-excluded-paths');
    await field.click();
    await field.setValue('Private');
    await app.browser.$('[role="dialog"] input#settings-notes-dailyFolder').click();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Escape');
    await app.browser.$('[role="dialog"]').waitForDisplayed({ reverse: true });

    await searchUntilFound('meeting', ['Plan.md']);
  });
});
