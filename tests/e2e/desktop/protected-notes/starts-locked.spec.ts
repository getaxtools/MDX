import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { ProtectedNotesPage } from '../../pages/ProtectedNotesPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PASSWORD = 'correct horse battery';

describe('starting the app with a protected section', () => {
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
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('restart keeps the section locked', async () => {
    await protectedNotes.setUp(PASSWORD);
    await protectedNotes.lockFromHeader();
    await protectedNotes.unlock(PASSWORD, { shouldRemember: true });
    await protectedNotes.createNote('Bank details');
    await mainWindow.waitForTabs(['Bank details']);

    await app.quit();
    await launch();

    await protectedNotes.waitForState('protectedNotes.section.locked');
    expect(await mainWindow.tabNames()).toEqual([]);
    expect(await mainWindow.statusBarText()).not.toContain('Protected notes unlocked');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
