import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('the note tree', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
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
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === `${name} - MDX`);
  }

  async function createNote(name: string): Promise<void> {
    await app.browser.$('button[aria-label="New Note"]').click();
    const input = app.browser.$('input[aria-label="Name of the new note"]');
    await input.setValue(name);
    await mainWindow.pressKeyOn(input, 'Enter');
    await mainWindow.waitForActiveTab(`${name}.md`);
  }

  async function noteRow(name: string) {
    const row = await mainWindow.treeItem('notes.tree.title', name);
    await row.waitForExist();
    return row;
  }

  it('create, rename and move a note, the tab follows', async () => {
    await createNote('Plan');
    expect(existsSync(join(notesFolder, 'Plan.md'))).toBe(true);

    await mainWindow.pressKeyOn(await noteRow('Plan'), 'F2');
    const renameInput = app.browser.$('input[aria-label="New name for Plan"]');
    await renameInput.setValue('Ideas');
    await mainWindow.pressKeyOn(renameInput, 'Enter');
    await mainWindow.waitForTabs(['Ideas.md']);
    expect(existsSync(join(notesFolder, 'Ideas.md'))).toBe(true);
    expect(existsSync(join(notesFolder, 'Plan.md'))).toBe(false);

    await createNote('Projects');
    await mainWindow.openContextMenuOn(await noteRow('Ideas'));
    await mainWindow.chooseMenuItem('notes.tree.cut');
    await mainWindow.openContextMenuOn(await noteRow('Projects'));
    await mainWindow.chooseMenuItem('notes.tree.pasteAsChild');

    await app.browser.waitUntil(() => existsSync(join(notesFolder, 'Projects', 'Ideas.md')));
    expect(existsSync(join(notesFolder, 'Ideas.md'))).toBe(false);
    await mainWindow.waitForTabs(['Ideas.md', 'Projects.md']);
    await mainWindow.activateTab('Ideas.md');
    expect(await mainWindow.windowTitle()).toBe('Ideas.md - Journal - MDX');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a name another note has is refused with a message', async () => {
    await createNote('Plan');

    await app.browser.$('button[aria-label="New Note"]').click();
    const input = app.browser.$('input[aria-label="Name of the new note"]');
    await input.setValue('plan');
    await mainWindow.pressKeyOn(input, 'Enter');

    await mainWindow.waitForNotice('errors.document.nameTaken', { path: 'plan' });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
