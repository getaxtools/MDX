import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FILLER_PARAGRAPHS = 40;

/** A plan long enough that its last heading is out of view until the link scrolls to it. */
function longPlan(): string {
  const filler = Array.from({ length: FILLER_PARAGRAPHS }, (_, index) => `Paragraph ${String(index + 1)}.`);
  return ['# Plan', '', ...filler.flatMap((line) => [line, '']), '## Next Steps', '', 'Ship it.', ''].join(
    '\n',
  );
}

describe('wiki-links between notes', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Projects'), { recursive: true });
    writeFileSync(
      join(notesFolder, 'Inbox.md'),
      '# Inbox\n\nSee [[Plan#Next Steps|the next steps]] and [[Budget]].\n',
    );
    writeFileSync(join(notesFolder, 'Projects', 'Plan.md'), longPlan());
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
    await (await mainWindow.treeItem('notes.tree.title', 'Inbox')).click();
    await mainWindow.waitForDocumentHeading('Inbox');
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

  it('activating a wiki-link opens the heading', async () => {
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.clickDocumentLink('the next steps');

    await mainWindow.waitForActiveTab('Plan.md');
    await app.browser.waitUntil(
      async () => (await app.browser.execute(() => document.activeElement?.textContent)) === 'Next Steps',
    );
    expect(await mainWindow.documentScrollTop()).toBeGreaterThan(0);
  });

  it('an unresolved link creates the note next to the linking note', async () => {
    await app.browser.$('main article .wiki-link-unresolved').click();
    await mainWindow.waitForNotice('notes.links.missing', { name: 'Budget' });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.clickNoticeAction('notes.links.create');

    await mainWindow.waitForActiveTab('Budget.md');
    expect(existsSync(join(notesFolder, 'Budget.md'))).toBe(true);
  });
});
