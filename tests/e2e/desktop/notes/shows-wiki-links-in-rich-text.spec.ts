import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { NotesFolderSnapshot } from '../../support/NotesFolderSnapshot';
import { TestWorkspace } from '../../support/TestWorkspace';

const INBOX_TEXT = '# Inbox\n\nSee [[Plan|the plan]]';
const EDITOR = '[role="textbox"][aria-label^="Source of"]';

describe('wiki-links in Rich text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesSnapshot: NotesFolderSnapshot;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(notesFolder, { recursive: true });
    writeFileSync(join(notesFolder, 'Inbox.md'), INBOX_TEXT);
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n');
    notesSnapshot = NotesFolderSnapshot.take(notesFolder);
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
    await (await mainWindow.treeItem('notes.tree.title', 'Inbox')).click();
    await mainWindow.waitForDocumentHeading('Inbox');
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

  it('a wiki-link shows without its brackets until the caret reaches it, and the note is unchanged', async () => {
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+Home');
    // The editor marks wiki-link text with a class only; it has no role of its own.
    await app.browser.$('.cm-rich-wiki-link').waitForDisplayed();
    expect(await app.browser.$(EDITOR).getText()).not.toContain('[[');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.pressShortcut('Ctrl+End');

    await app.browser.waitUntil(async () =>
      (await app.browser.$(EDITOR).getText()).includes('[[Plan|the plan]]'),
    );
    await mainWindow.waitForSavedTab('Inbox.md');
    expect(readFileSync(join(notesFolder, 'Inbox.md'), 'utf8')).toBe(INBOX_TEXT);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
