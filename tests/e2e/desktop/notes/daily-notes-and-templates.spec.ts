import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

/** Today as the default daily note name writes it, YYYY-MM-DD in local time. */
function today(): string {
  const now = new Date();
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  return `${String(now.getFullYear())}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}

describe('daily notes and templates', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Templates'), { recursive: true });
    writeFileSync(join(notesFolder, 'Templates', 'Meeting.md'), '# {{title}}\n\nAttendees:\n');
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
    await runFromPalette('New Workspace…');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue(name);
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await mainWindow.confirmNotesFolder({ holdsFiles: true });
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === `${name} - MDX`);
  }

  async function runFromPalette(label: string): Promise<void> {
    await mainWindow.searchInCommandPalette(`>${label}`);
    await mainWindow.waitForCommandPaletteOption(label);
    await mainWindow.pressShortcut('Enter');
  }

  it("today's note is created once and reopened", async () => {
    const name = `${today()}.md`;

    await runFromPalette("Open Today's Note");
    await mainWindow.waitForActiveTab(name);
    await mainWindow.closeTab(name);
    await runFromPalette("Open Today's Note");

    await mainWindow.waitForActiveTab(name);
    expect(readdirSync(join(notesFolder, 'Daily'))).toEqual([name]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a note from a template has its variables filled', async () => {
    await runFromPalette('New Note from Template…');
    const dialog = app.browser.$('[role="dialog"]');
    const nameInput = dialog.$('input#note-from-template-name');
    await nameInput.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await nameInput.setValue('Standup');
    await dialog.$('button=Create').click();

    await mainWindow.waitForActiveTab('Standup.md');
    expect(existsSync(join(notesFolder, 'Standup.md'))).toBe(true);
    expect(readFileSync(join(notesFolder, 'Standup.md'), 'utf8')).toBe('# Standup\n\nAttendees:\n');
  });
});
