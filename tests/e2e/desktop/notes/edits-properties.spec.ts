import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChainablePromiseElement } from 'webdriverio';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PLAN_TEXT = '---\r\nstatus: draft\r\nowner: Ana\r\n---\r\n\r\n# Plan\r\n';
const BUDGET_TEXT = '---\nowner:\n  name: Ana\n---\n\n# Budget\n';

describe('note properties', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(notesFolder, { recursive: true });
    writeFileSync(join(notesFolder, 'Plan.md'), PLAN_TEXT);
    writeFileSync(join(notesFolder, 'Budget.md'), BUDGET_TEXT);
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

  async function openProperties(noteName: string): Promise<ChainablePromiseElement> {
    await (await mainWindow.treeItem('notes.tree.title', noteName)).click();
    await mainWindow.waitForDocumentHeading(noteName);
    const properties = app.browser.$('main details');
    await properties.$('summary').click();
    return properties;
  }

  function noteText(name: string): string {
    return readFileSync(join(notesFolder, name), 'utf8');
  }

  it('edit a status value', async () => {
    const properties = await openProperties('Plan');
    const fieldId = await properties.$('label=status').getAttribute('for');
    const statusField = app.browser.$(`[id="${fieldId ?? ''}"]`);
    expect(await statusField.getValue()).toBe('draft');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await statusField.setValue('done');
    await mainWindow.pressKeyOn(statusField, 'Enter');

    await app.browser.waitUntil(() => noteText('Plan.md') === PLAN_TEXT.replace('draft', 'done'));
    await app.browser.waitUntil(async () => (await statusField.getValue()) === 'done');
    await mainWindow.waitForSavedTab('Plan.md');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('complex properties are read-only with Edit in Note', async () => {
    const properties = await openProperties('Budget');
    expect(await properties.$$('input').length).toBe(0);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await properties.$('button=Edit in Note').click();

    await app.browser.$('[role="textbox"][aria-label^="Source of"]').waitForDisplayed();
    expect(noteText('Budget.md')).toBe(BUDGET_TEXT);
  });
});
