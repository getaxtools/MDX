import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FIRST_WINDOW = 'main';
const SECOND_WINDOW = 'window-2';
/** Debug builds answer the folder picker with these folders, one per pick. */
const PICKED_FOLDERS_VARIABLE = 'MDX_UI_TEST_PICKED_FOLDERS';
const HANDBOOK_FOLDER = 'handbook';

describe('several windows', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let page: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    const handbookFolder = workspace.documentPath(HANDBOOK_FOLDER);
    mkdirSync(handbookFolder, { recursive: true });
    writeFileSync(join(handbookFolder, 'plan.md'), '# Plan');
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
      environment: { [PICKED_FOLDERS_VARIABLE]: handbookFolder },
    });
    page = new MainWindowPage(app.browser);
    await page.waitForActiveTab('release-notes.md');
  });

  afterEach(async () => {
    if ((await app.browser.getWindowHandles()).includes(SECOND_WINDOW)) {
      await app.browser.switchToWindow(SECOND_WINDOW);
      await app.browser.closeWindow();
    }
    await app.browser.switchToWindow(FIRST_WINDOW);
    await app.quit();
    workspace.remove();
  });

  async function runFromPalette(label: string): Promise<void> {
    await page.searchInCommandPalette(`>${label}`);
    await page.waitForCommandPaletteOption(label);
    await page.pressShortcut('Enter');
  }

  /** New Window opens on the shown workspace and starts with no tabs. */
  async function openSecondWindow(): Promise<void> {
    await runFromPalette('New Window');
    await app.browser.waitUntil(async () => (await app.browser.getWindowHandles()).includes(SECOND_WINDOW));
    await app.browser.switchToWindow(SECOND_WINDOW);
    await app.browser.waitUntil(async () => (await page.emptyStateText()).length > 0);
    await page.waitForTabs([]);
  }

  it('a star in one window appears in the other', async () => {
    await openSecondWindow();
    await app.browser.switchToWindow(FIRST_WINDOW);

    await page.toggleFavourite();
    await page.waitForFavourites(['release-notes.md']);
    await app.browser.switchToWindow(SECOND_WINDOW);

    await page.waitForFavourites(['release-notes.md']);
    expect(await page.tabNames()).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('a double-clicked file opens in the window whose workspace contains it', async () => {
    await openSecondWindow();
    await runFromPalette('New Workspace…');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue('Handbook');
    await dialog.$('button=Create').click();
    await page.waitForExplorerFolderEntries(HANDBOOK_FOLDER, ['plan.md']);
    await app.browser.switchToWindow(FIRST_WINDOW);
    await page.activateTab('getting-started.md');

    await DesktopApp.launchSecondInstance({
      workspace,
      documentFileNames: [join(HANDBOOK_FOLDER, 'plan.md')],
    });

    await app.browser.switchToWindow(SECOND_WINDOW);
    await page.waitForTabs(['plan.md']);
    expect(await page.windowTitle()).toBe('plan.md - Handbook - MDX');
    await app.browser.switchToWindow(FIRST_WINDOW);
    expect(await page.tabNames()).toEqual(['getting-started.md', 'release-notes.md']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
