import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

/** How soon a change saved by another program must show while the workspace is open. */
const OUTSIDE_CHANGE_BUDGET_MS = 3_000;
const INDEX_WAIT_MS = 10_000;

describe('backlinks and tags', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Work'), { recursive: true });
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n\nThe plan. #work\n');
    writeFileSync(join(notesFolder, 'Inbox.md'), '# Inbox\n\nNothing linked yet.\n');
    writeFileSync(join(notesFolder, 'Work', 'Budget.md'), '# Budget\n\nCosts. #work #money\n');
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

  it('a link added by another program appears within 3 seconds', async () => {
    await (await mainWindow.treeItem('notes.tree.title', 'Plan')).click();
    const heading = app.browser.$('#note-backlinks-heading');
    await app.browser.waitUntil(async () => (await heading.getText()) === 'Linked from no other note', {
      timeout: INDEX_WAIT_MS,
    });

    writeFileSync(join(notesFolder, 'Inbox.md'), '# Inbox\n\nRead the [[Plan]] today.\n');

    await app.browser.waitUntil(async () => (await heading.getText()) === 'Linked from 1 note', {
      timeout: OUTSIDE_CHANGE_BUDGET_MS,
    });
    expect(await app.browser.$('.backlinks button').getText()).toContain('Read the [[Plan]] today.');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('choosing a tag lists its notes', async () => {
    const work = app.browser.$('[role="treeitem"][aria-label="work, 2 notes"]');
    await work.waitForExist({ timeout: INDEX_WAIT_MS });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await work.click();

    await app.browser.waitUntil(async () => {
      const found = await app.browser.$$('.folder-search .results button').map((note) => note.getText());
      return JSON.stringify([...found].sort()) === JSON.stringify(['Budget.md', 'Plan.md']);
    });
    expect(await app.browser.$('input[type="search"]').getValue()).toBe('tag:work');
  });
});
