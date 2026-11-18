import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { ProtectedNotesPage } from '../../pages/ProtectedNotesPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PASSWORD = 'correct horse battery';
/** The app starts five times in this spec. */
const RESTARTING_SPEC_TIMEOUT_MS = 180_000;
const OLDER_NOTES_WARNING =
  'This protected section is older than when this PC last opened it. Notes may have gone back to earlier versions.';

describe('a protected section put back from an older copy', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let protectedNotes: ProtectedNotesPage;
  let sectionFolder: string;
  let olderCopy: string;

  async function launch(): Promise<void> {
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    protectedNotes = new ProtectedNotesPage(app.browser, mainWindow);
  }

  async function restart(): Promise<void> {
    await app.quit();
    await launch();
    await protectedNotes.waitForState('protectedNotes.section.locked');
  }

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    sectionFolder = join(workspace.homeDocumentsFolder, 'MDX Notes', '.mdx-notes', 'protected');
    olderCopy = join(workspace.profileFolder, '..', 'older-section-copy');
    await launch();
    await mainWindow.emptyStateText();
    await protectedNotes.createNotesWorkspace('Journal');
  });

  /** Copies the section with one note, adds a second note, then puts the copy back while the app is closed. */
  async function putBackAnOlderCopy(): Promise<void> {
    await protectedNotes.setUp(PASSWORD);
    await protectedNotes.createNote('Bank details');
    await restart();
    cpSync(sectionFolder, olderCopy, { recursive: true });
    await protectedNotes.unlock(PASSWORD);
    await protectedNotes.createNote('Passport');
    await protectedNotes.waitForNoteTitles(['Bank details', 'Passport']);
    await app.quit();
    rmSync(sectionFolder, { recursive: true });
    cpSync(olderCopy, sectionFolder, { recursive: true });
    await launch();
    await protectedNotes.waitForState('protectedNotes.section.locked');
  }

  afterEach(async () => {
    await app.quit();
    rmSync(olderCopy, { recursive: true, force: true });
    workspace.remove();
  });

  it(
    'warns on every unlock until the folder is kept with its own button',
    { timeout: RESTARTING_SPEC_TIMEOUT_MS },
    async () => {
      await putBackAnOlderCopy();
      await protectedNotes.unlock(PASSWORD);
      expect(await protectedNotes.folderWarning()).toContain(OLDER_NOTES_WARNING);
      expect(await protectedNotes.noteTitles()).toEqual([]);
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);

      await restart();
      await protectedNotes.unlock(PASSWORD);
      expect(await protectedNotes.folderWarning()).toContain(OLDER_NOTES_WARNING);
      await protectedNotes.keepFolder();
      await protectedNotes.waitForNoteTitles(['Bank details']);

      await restart();
      await protectedNotes.unlock(PASSWORD);
      await protectedNotes.waitForNoteTitles(['Bank details']);
      expect(await protectedNotes.section().$('[role="alert"]').isExisting()).toBe(false);
    },
  );
});
