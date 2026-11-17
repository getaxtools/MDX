import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const HIDE_BUTTON = 'button[aria-label="Hide side bar"]';
const SHOW_BUTTON = 'button[aria-label="Show side bar"]';
const EXPLORER_BUTTON = 'nav[aria-label="Panels"] button[aria-label="Explorer"]';

describe('hiding and showing the side bar', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    workspace.saveDocumentsFolder({ inExplorer: true });
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForActiveTab('getting-started.md');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('the header button hides the side bar', async () => {
    await app.browser.$(HIDE_BUTTON).click();

    await app.browser.$(SHOW_BUTTON).waitForDisplayed();
    expect(await app.browser.$(HIDE_BUTTON).isExisting()).toBe(false);
    expect(await app.browser.$(EXPLORER_BUTTON).getAttribute('aria-pressed')).toBe('false');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await app.browser.$(SHOW_BUTTON).click();

    await app.browser.$(HIDE_BUTTON).waitForDisplayed();
    expect(await app.browser.$(SHOW_BUTTON).isExisting()).toBe(false);
    expect(await app.browser.$(EXPLORER_BUTTON).getAttribute('aria-pressed')).toBe('true');
  });

  it('a hidden side bar stays hidden after a restart', async () => {
    await app.browser.$(HIDE_BUTTON).click();
    await app.browser.$(SHOW_BUTTON).waitForDisplayed();

    await app.quit();
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForActiveTab('getting-started.md');

    expect(await app.browser.$(SHOW_BUTTON).isDisplayed()).toBe(true);
    expect(await app.browser.$(HIDE_BUTTON).isExisting()).toBe(false);
  });
});
