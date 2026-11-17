import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FIRST_WINDOW = 'main';
const SECOND_WINDOW = 'window-2';

describe('several windows', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let page: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['getting-started.md', 'release-notes.md'],
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

  /** New Window opens on the shown workspace and starts with no tabs. */
  async function openSecondWindow(): Promise<void> {
    await page.searchInCommandPalette('>New Window');
    await page.waitForCommandPaletteOption('New Window');
    await page.pressShortcut('Enter');
    await app.browser.waitUntil(async () => (await app.browser.getWindowHandles()).includes(SECOND_WINDOW));
    await app.browser.switchToWindow(SECOND_WINDOW);
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

    await DesktopApp.launchSecondInstance({ workspace, documentFileNames: ['getting-started.md'] });

    await app.browser.switchToWindow(FIRST_WINDOW);
    await page.waitForActiveTab('getting-started.md');
    expect(await page.tabNames()).toEqual(['getting-started.md', 'release-notes.md']);
    await app.browser.switchToWindow(SECOND_WINDOW);
    expect(await page.tabNames()).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
