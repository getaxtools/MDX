import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { ProtectedNotesPage } from '../../pages/ProtectedNotesPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PASSWORD = 'correct horse battery';

describe('locking a protected section', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let protectedNotes: ProtectedNotesPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    protectedNotes = new ProtectedNotesPage(app.browser, mainWindow);
    await mainWindow.emptyStateText();
    await protectedNotes.createNotesWorkspace('Journal');
    await protectedNotes.setUp(PASSWORD);
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('lock closes protected tabs', async () => {
    await protectedNotes.createNote('Bank details');
    await protectedNotes.createNote('Passport');
    await mainWindow.waitForTabs(['Bank details', 'Passport']);
    await mainWindow.waitForStatusBarText('Protected notes unlocked');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.searchInCommandPalette('>Lock Protected Notes');
    await mainWindow.waitForCommandPaletteOption('Lock Protected Notes');
    await mainWindow.pressShortcut('Enter');

    await mainWindow.waitForTabs([]);
    await protectedNotes.waitForState('protectedNotes.section.locked');
    expect(await mainWindow.statusBarText()).not.toContain('Protected notes unlocked');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('locks from the status bar and with Ctrl+Alt+L', async () => {
    await protectedNotes.createNote('Bank details');
    await protectedNotes.lockFromStatusBar();
    await protectedNotes.waitForState('protectedNotes.section.locked');
    await protectedNotes.unlock(PASSWORD);
    await protectedNotes.openNote('Bank details');

    await mainWindow.pressShortcut('Ctrl+Alt+L');

    await protectedNotes.waitForState('protectedNotes.section.locked');
    await mainWindow.waitForTabs([]);
  });

  it('remembered unlock needs no password', async () => {
    await protectedNotes.lockFromHeader();
    await protectedNotes.unlock(PASSWORD, { shouldRemember: true });
    await protectedNotes.lockFromHeader();
    await protectedNotes.waitForState('protectedNotes.section.locked');

    expect(await protectedNotes.hasPasswordField()).toBe(false);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await protectedNotes.unlockOnThisPc();

    await protectedNotes.waitForState('protectedNotes.section.unlocked');
  });

  it('forget this PC asks for the password', async () => {
    await protectedNotes.lockFromHeader();
    await protectedNotes.unlock(PASSWORD, { shouldRemember: true });
    await protectedNotes.forgetThisPc();
    await mainWindow.waitForNotice('protectedNotes.unlock.forgotten', {});
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await protectedNotes.lockFromHeader();
    await protectedNotes.waitForState('protectedNotes.section.locked');

    expect(await protectedNotes.hasPasswordField()).toBe(true);
    await protectedNotes.unlock(PASSWORD);
  });
});
