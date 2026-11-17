import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const SEARCH_WAIT_MS = 10_000;
/** How soon a note saved by another program must be found while the workspace is open. */
const OUTSIDE_CHANGE_BUDGET_MS = 3_000;

describe('searching notes', () => {
  let notesFolder: string;
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Trips'), { recursive: true });
    mkdirSync(join(notesFolder, 'Work'), { recursive: true });
    writeFileSync(
      join(notesFolder, 'Trips', 'Paris.md'),
      '# Paris\n\nCoffee at the Café de Flore. #travel\n',
    );
    writeFileSync(join(notesFolder, 'Work', 'Budget.md'), '# Budget\n\nThe cafe costs too much. #work\n');
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
    await mainWindow.pressShortcut('Ctrl+Shift+F');
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

  /** Searches until the index has the notes, as a build runs in the background after the workspace opens. */
  async function searchUntilFound(
    query: string,
    expectedNotes: readonly string[],
    { timeoutMs = SEARCH_WAIT_MS }: { timeoutMs?: number } = {},
  ): Promise<void> {
    await app.browser.waitUntil(
      async () => {
        const found = await mainWindow.searchedDocumentNames(query);
        return JSON.stringify([...found].sort()) === JSON.stringify([...expectedNotes].sort());
      },
      { timeout: timeoutMs },
    );
  }

  it('accent-insensitive search', async () => {
    await searchUntilFound('cafe', ['Budget.md', 'Paris.md']);

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('tag and path filters', async () => {
    await searchUntilFound('cafe tag:travel', ['Paris.md']);
    await searchUntilFound('cafe path:Work', ['Budget.md']);

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a note written by another program is searchable within 3 seconds', async () => {
    await searchUntilFound('cafe', ['Budget.md', 'Paris.md']);

    writeFileSync(join(notesFolder, 'Work', 'Later.md'), '# Later\n\nA quokka visited the office.\n');

    await searchUntilFound('quokka', ['Later.md'], { timeoutMs: OUTSIDE_CHANGE_BUDGET_MS });
  });
});
