import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { ProtectedNotesPage } from '../../pages/ProtectedNotesPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PASSWORD = 'correct horse battery';

describe('setting up a protected section', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let protectedNotes: ProtectedNotesPage;
  let sectionFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    sectionFolder = join(workspace.homeDocumentsFolder, 'MDX Notes', '.mdx-notes', 'protected');
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    protectedNotes = new ProtectedNotesPage(app.browser, mainWindow);
    await protectedNotes.createNotesWorkspace('Journal');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('set up a protected section', async () => {
    const warning = await protectedNotes.startSetUp();
    expect(await warning.getText()).toContain('not even the makers of MDX');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await protectedNotes.choosePassword(PASSWORD);
    const recoveryKey = await protectedNotes.shownRecoveryKey();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await protectedNotes.confirmRecoveryKeyEnd('0000-00');
    expect(await protectedNotes.shownRecoveryKey()).toBe(recoveryKey);
    await protectedNotes.confirmRecoveryKeyEnd(recoveryKey.split('-').slice(-2).join('-'));

    await app.browser.waitUntil(async () => !(await protectedNotes.isDialogOpen()));
    await protectedNotes.waitForState('protectedNotes.section.unlocked');
    expect(await protectedNotes.section().getText()).toContain('No protected notes yet.');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    const files = readdirSync(sectionFolder).sort();
    expect(files).toEqual(['manifest.mdxp', 'notes', 'vault.json']);
    expect(readFileSync(join(sectionFolder, 'vault.json'), 'utf8')).not.toContain(PASSWORD);
  });
});
