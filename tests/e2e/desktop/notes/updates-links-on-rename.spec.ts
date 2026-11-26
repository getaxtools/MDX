import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const INDEX_WAIT_MS = 10_000;
/** The notes linking to Draft before the rename, by their path inside the notes folder. */
const LINKING_NOTES: Readonly<Record<string, string>> = {
  'Inbox.md': '# Inbox\n\nSee [[Draft]] today.\n',
  'Ideas.md': '# Ideas\r\n\r\nAlso [[Draft|the draft]].\r\n',
  'Projects/Review.md': '\u{FEFF}Read [[Draft#Goals]] first.\n',
};

describe('links follow a renamed note', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Projects'), { recursive: true });
    writeFileSync(join(notesFolder, 'Draft.md'), '# Draft\n\n## Goals\n\nShip it.\n');
    for (const [path, text] of Object.entries(LINKING_NOTES)) writeFileSync(join(notesFolder, path), text);
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

  function noteText(path: string): string {
    return readFileSync(join(notesFolder, path), 'utf8');
  }

  async function waitForNoteText(path: string, expected: string): Promise<void> {
    await app.browser.waitUntil(() => existsSync(join(notesFolder, path)) && noteText(path) === expected);
  }

  it('rename with preview, then undo restores names and links', async () => {
    await (await mainWindow.treeItem('notes.tree.title', 'Draft')).click();
    const backlinks = app.browser.$('#note-backlinks-heading');
    await app.browser.waitUntil(async () => (await backlinks.getText()) === 'Linked from 3 notes', {
      timeout: INDEX_WAIT_MS,
    });

    await mainWindow.pressKeyOn(await mainWindow.treeItem('notes.tree.title', 'Draft'), 'F2');
    const renameInput = app.browser.$('input[aria-label="New name for Draft"]');
    await renameInput.setValue('Plan');
    await mainWindow.pressKeyOn(renameInput, 'Enter');
    const preview = app.browser.$('[role="dialog"][aria-labelledby]');
    await app.browser.waitUntil(async () => (await preview.$('h2').getText()) === 'Update links to Plan?');
    const previewText = await preview.getText();
    expect(previewText).toContain('See [[Plan]] today.');
    expect(previewText).toContain('Also [[Plan|the draft]].');
    expect(previewText).toContain('Read [[Plan#Goals]] first.');
    expect(noteText('Inbox.md')).toBe(LINKING_NOTES['Inbox.md']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await preview.$('button=Update Links').click();

    await waitForNoteText('Inbox.md', '# Inbox\n\nSee [[Plan]] today.\n');
    await waitForNoteText('Ideas.md', '# Ideas\r\n\r\nAlso [[Plan|the draft]].\r\n');
    await waitForNoteText('Projects/Review.md', '\u{FEFF}Read [[Plan#Goals]] first.\n');
    await mainWindow.waitForTabs(['Plan.md']);
    await mainWindow.clickNoticeAction('notes.linkUpdates.undo');

    await waitForNoteText('Draft.md', '# Draft\n\n## Goals\n\nShip it.\n');
    expect(existsSync(join(notesFolder, 'Plan.md'))).toBe(false);
    for (const [path, text] of Object.entries(LINKING_NOTES)) await waitForNoteText(path, text);
    await mainWindow.waitForTabs(['Draft.md']);
    await mainWindow.waitForNotice('notes.linkUpdates.undone', { name: 'Draft' });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
