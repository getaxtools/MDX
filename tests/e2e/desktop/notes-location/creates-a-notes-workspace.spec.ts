import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('creating a Notes workspace', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    const controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function createNotesWorkspace(name: string): Promise<void> {
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue(name);
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
  }

  it('create a Notes workspace in the default folder', async () => {
    const notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');

    await createNotesWorkspace('Journal');
    const shownFolder = await app.browser
      .$('[role="dialog"] [aria-labelledby="notes-location-label"] code')
      .getText();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await app.browser.$('[role="dialog"]').$('button=Create').click();

    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Journal - MDX');
    expect(shownFolder).toBe(notesFolder);
    const marker = JSON.parse(
      readFileSync(join(notesFolder, '.mdx-notes', 'notes-location.json'), 'utf8'),
    ) as {
      locationId: string;
    };
    expect(marker.locationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('Open in File Explorer is offered for the location', async () => {
    await createNotesWorkspace('Journal');
    await app.browser.$('[role="dialog"]').$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Journal - MDX');

    await mainWindow.pressShortcut('Ctrl+,');
    const section = app.browser.$('section[aria-labelledby="settings-section-notes"]');
    await section.waitForDisplayed();

    expect(await section.$('button=Open in File Explorer').isExisting()).toBe(true);
    const shownText = (await section.getText()).toLowerCase();
    expect(shownText).toContain(join(workspace.homeDocumentsFolder, 'MDX Notes').toLowerCase());
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a second Notes workspace suggests its own folder and never reuses the first', async () => {
    await createNotesWorkspace('Journal');
    await app.browser.$('[role="dialog"]').$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Journal - MDX');

    await createNotesWorkspace('Work');
    const suggested = await app.browser
      .$('[role="dialog"] [aria-labelledby="notes-location-label"] code')
      .getText();

    expect(suggested).toBe(join(workspace.homeDocumentsFolder, 'MDX Notes - Work'));
    expect(existsSync(join(workspace.homeDocumentsFolder, 'MDX Notes - Work'))).toBe(false);
  });
});
