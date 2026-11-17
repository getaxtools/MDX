import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { FileArcPage } from '../../pages/FileArcPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const NOTES_TITLE = 'notes.tree.title';

describe('moving between notes with the file arc', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let fileArc: FileArcPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    const notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(notesFolder, { recursive: true });
    writeFileSync(join(notesFolder, 'Inbox.md'), '# Inbox\n');
    writeFileSync(join(notesFolder, 'MDX roadmap.md'), '# MDX roadmap\n');
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    fileArc = new FileArcPage(app.browser, 'notes');
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

  it('ctrl+down opens the arc on the next note and letting go opens it', async () => {
    await (await mainWindow.treeItem(NOTES_TITLE, 'Inbox')).click();
    await mainWindow.waitForActiveTab('Inbox.md');

    await fileArc.holdControl();
    await fileArc.pressArrow('ArrowDown');
    await fileArc.waitForOpen();

    expect(await fileArc.highlightedName()).toBe('MDX roadmap');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await fileArc.letGoOfControl();

    await mainWindow.waitForActiveTab('MDX roadmap.md');
    await fileArc.waitForClosed();
  });
});
