import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('the Notes trash', () => {
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

  it('delete and restore a note', async () => {
    await createNote('Plan');
    const row = await mainWindow.treeItem('notes.tree.title', 'Plan');

    await mainWindow.pressKeyOn(row, 'Delete');
    const question = app.browser.$('[role="alertdialog"]');
    await question.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await question.$('button=Move to Trash').click();
    await mainWindow.waitForTabs([]);
    expect(existsSync(join(notesFolder, 'Plan.md'))).toBe(false);
    expect(readdirSync(join(notesFolder, '.mdx-notes', 'trash'))).toHaveLength(1);

    await app.browser.$('button[aria-label="Show Trash"]').click();
    const trash = app.browser.$('[role="dialog"]');
    await trash.$('button[aria-label="Restore Plan"]').waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await trash.$('button[aria-label="Restore Plan"]').click();

    await app.browser.waitUntil(() => existsSync(join(notesFolder, 'Plan.md')));
    await trash.$('p=The trash is empty.').waitForDisplayed();
    expect(readdirSync(join(notesFolder, '.mdx-notes', 'trash'))).toEqual([]);
  });
});
