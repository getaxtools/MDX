import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const INBOX_TEXT = '# Inbox\n\n![[Plan]]\n\n![[Missing]]\n\nThe end';

describe('embedded notes in Rich text', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(notesFolder, { recursive: true });
    writeFileSync(join(notesFolder, 'Inbox.md'), INBOX_TEXT);
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n\nBook the venue.\n');
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

  it('an embedded note shows read-only, a missing one says Not found, and Enter opens the note', async () => {
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+Home');
    const plan = app.browser.$('[role="region"][aria-label="Embedded note Plan"]');
    await plan.$('p*=Book the venue.').waitForDisplayed();
    await app.browser
      .$('[role="region"][aria-label="Embedded note Missing"]')
      .$('div=Not found: Missing')
      .waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.pressKeyOn(plan, 'Enter');

    await mainWindow.waitForActiveTab('Plan.md');
    expect(readFileSync(join(notesFolder, 'Inbox.md'), 'utf8')).toBe(INBOX_TEXT);
  });
});
