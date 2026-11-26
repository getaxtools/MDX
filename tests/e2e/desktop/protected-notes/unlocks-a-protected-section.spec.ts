import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { ProtectedNotesPage } from '../../pages/ProtectedNotesPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PASSWORD = 'correct horse battery';

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('unlocking a protected section', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let protectedNotes: ProtectedNotesPage;

  async function launch(): Promise<void> {
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    protectedNotes = new ProtectedNotesPage(app.browser, mainWindow);
  }

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    await launch();
    await mainWindow.emptyStateText();
    await protectedNotes.createNotesWorkspace('Journal');
    await protectedNotes.setUp(PASSWORD);
    await protectedNotes.createNote('Bank details');
    await mainWindow.typeAtEndOfDocument('PIN 4821');
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab('Bank details');
    await app.quit();
    await launch();
    await protectedNotes.waitForState('protectedNotes.section.locked');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('unlock with password', async () => {
    expect(await mainWindow.tabNames()).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await protectedNotes.unlock(PASSWORD);
    await protectedNotes.waitForNoteTitles(['Bank details']);
    await protectedNotes.openNote('Bank details');

    expect(await mainWindow.documentText()).toContain('PIN 4821');
    expect(await mainWindow.windowTitle()).not.toContain('Bank details');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    const notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    const plainMatches = filesUnder(notesFolder).filter((file) => {
      const contents = readFileSync(file, 'latin1');
      return contents.includes('4821') || contents.includes('Bank details');
    });
    expect(plainMatches).toEqual([]);
  });

  it('wrong password stays locked', async () => {
    await protectedNotes.enterPassword('not the password');

    expect(await protectedNotes.unlockProblem()).toBe('That password did not open the protected notes.');
    expect(await protectedNotes.headingName()).toBe('Protected notes Locked');
    expect(await protectedNotes.noteTitles()).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
