import type { MessageKey } from '@mdx/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('the Notes tree in place of Folders', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  const foldersTitle = 'explorer.folders.title';
  const notesTitle = 'notes.tree.title';

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await (await mainWindow.treeItem(foldersTitle, 'documents')).waitForExist();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function runFromPalette(label: string): Promise<void> {
    await mainWindow.searchInCommandPalette(`>${label}`);
    await mainWindow.waitForCommandPaletteOption(label);
    await mainWindow.pressShortcut('Enter');
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
    await runFromPalette('New Workspace…');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue(name);
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await mainWindow.confirmNotesFolder({ holdsFiles: false });
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

  async function waitForSectionTitles(expected: { shown: MessageKey; hidden: MessageKey }): Promise<void> {
    await app.browser.waitUntil(
      async () =>
        (await mainWindow.hasSidebarSection(expected.shown)) &&
        !(await mainWindow.hasSidebarSection(expected.hidden)),
    );
  }

  it('switching to a Notes workspace shows its tree', async () => {
    await turnOnNotes();
    await createNotesWorkspace('Journal');
    await createNote('Plan');

    await waitForSectionTitles({ shown: notesTitle, hidden: foldersTitle });
    await (await mainWindow.treeItem(notesTitle, 'Plan')).waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await runFromPalette('Workspace: Default');
    await waitForSectionTitles({ shown: foldersTitle, hidden: notesTitle });
    await (await mainWindow.treeItem(foldersTitle, 'documents')).waitForExist();

    await runFromPalette('Workspace: Journal');
    await waitForSectionTitles({ shown: notesTitle, hidden: foldersTitle });
    await (await mainWindow.treeItem(notesTitle, 'Plan')).waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
