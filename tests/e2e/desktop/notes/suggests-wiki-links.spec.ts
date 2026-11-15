import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const INDEX_WAIT_MS = 10_000;
/** How soon suggestions must show after typing, once the index is built. */
const SUGGESTION_BUDGET_MS = 100;
const SUGGESTIONS = '.cm-tooltip-autocomplete [role="option"]';

describe('wiki-link suggestions while editing a note', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Projects'), { recursive: true });
    writeFileSync(join(notesFolder, 'Inbox.md'), '# Inbox\n\nRead ');
    writeFileSync(join(notesFolder, 'Projects', 'Plan.md'), '# Plan\n\n## Goals\n\nShip it.\n');
    writeFileSync(join(notesFolder, 'Projects', 'Planning.md'), '# Planning\n');
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
    await (await mainWindow.treeItem('notes.tree.title', 'Inbox')).click();
    await mainWindow.waitForDocumentHeading('Inbox');
    await waitUntilIndexed();
    await mainWindow.startEditing();
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

  /** The index builds in the background; a search finding the notes says it is done. */
  async function waitUntilIndexed(): Promise<void> {
    await mainWindow.pressShortcut('Ctrl+Shift+F');
    const input = app.browser.$('input[type="search"][aria-label="Search in folders"]');
    await app.browser.waitUntil(
      async () => {
        await input.setValue('ship');
        await mainWindow.pressKeyOn(input, 'Enter');
        const found = await app.browser.$$('.folder-search .results .document').map((note) => note.getText());
        return found.includes('Plan.md');
      },
      { timeout: INDEX_WAIT_MS },
    );
  }

  async function suggestionLabels(): Promise<string[]> {
    return app.browser.$$(`${SUGGESTIONS} .cm-completionLabel`).map((label) => label.getText());
  }

  /** Types at the end of the note and measures in the page how long the first suggestion takes to show. */
  async function typeAndTimeSuggestions(text: string): Promise<number> {
    await mainWindow.typeAtEndOfDocument('');
    return app.browser.execute(
      (typed: string, selector: string) =>
        new Promise<number>((resolve) => {
          const started = performance.now();
          const observer = new MutationObserver(() => {
            if (!document.querySelector(selector)) return;
            observer.disconnect();
            resolve(performance.now() - started);
          });
          observer.observe(document.body, { childList: true, subtree: true });
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- still the only way to insert text as an input method does
          document.execCommand('insertText', false, typed);
        }),
      text,
      SUGGESTIONS,
    );
  }
  it('suggestions appear within 100 ms', async () => {
    const shownAfterMs = await typeAndTimeSuggestions('[[pl');

    expect(await suggestionLabels()).toEqual(['Plan', 'Planning']);
    expect(shownAfterMs).toBeLessThan(SUGGESTION_BUDGET_MS);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('choosing a heading writes the link and closes the brackets', async () => {
    await mainWindow.typeAtEndOfDocument('[[Plan#go');
    await app.browser.waitUntil(async () => (await suggestionLabels()).join() === 'Goals');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.pressShortcut('Enter');
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab('Inbox.md');
    expect(readFileSync(join(notesFolder, 'Inbox.md'), 'utf8')).toBe('# Inbox\n\nRead [[Plan#Goals]]');
  });
});
