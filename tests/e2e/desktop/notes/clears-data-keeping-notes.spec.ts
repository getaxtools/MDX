import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { NotesFolderSnapshot } from '../../support/NotesFolderSnapshot';
import { TestWorkspace } from '../../support/TestWorkspace';

const INDEX_WAIT_MS = 10_000;

describe('Clear All Data in a Notes workspace', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesSnapshot: NotesFolderSnapshot;
  let notesFolder: string;
  let indexFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    indexFolder = join(workspace.profileFolder, 'notes-index');
    mkdirSync(notesFolder, { recursive: true });
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n\nBook the venue.\n');
    notesSnapshot = NotesFolderSnapshot.take(notesFolder);
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
  });

  afterEach(async () => {
    await app.quit();
    let changedNotes: string[];
    try {
      changedNotes = notesSnapshot.changedNotes();
    } finally {
      workspace.remove();
    }
    expect(changedNotes).toEqual([]);
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

  async function createNotesWorkspace(name: string, { holdsFiles }: { holdsFiles: boolean }): Promise<void> {
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue(name);
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await mainWindow.confirmNotesFolder({ holdsFiles });
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === `${name} - MDX`);
  }

  async function searchUntilFound(query: string, expectedNote: string): Promise<void> {
    await mainWindow.pressShortcut('Ctrl+Shift+F');
    await app.browser.waitUntil(
      async () => {
        const found = await mainWindow.searchedDocumentNames(query);
        return found.includes(expectedNote);
      },
      { timeout: INDEX_WAIT_MS },
    );
  }

  function indexFiles(): string[] {
    return existsSync(indexFolder)
      ? readdirSync(indexFolder).filter((name) => name.endsWith('.notes-index'))
      : [];
  }

  it('notes survive Clear All Data and the index rebuilds', async () => {
    await turnOnNotes();
    await createNotesWorkspace('Journal', { holdsFiles: true });
    await searchUntilFound('venue', 'Plan.md');
    expect(indexFiles()).toHaveLength(1);

    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser.$('button=Clear All Data…').click();
    const question = app.browser.$('[role="alertdialog"]');
    await question.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await question.$('button=Clear All Data').click();

    await app.browser.waitUntil(() => indexFiles().length === 0);
    expect(readFileSync(join(notesFolder, 'Plan.md'), 'utf8')).toBe('# Plan\n\nBook the venue.\n');
    await turnOnNotes();
    // The folder keeps its marker through Clear All Data, so it is known as a Notes folder again.
    await createNotesWorkspace('Journal', { holdsFiles: false });
    await searchUntilFound('venue', 'Plan.md');
  });
});
