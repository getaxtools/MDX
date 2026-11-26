import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZOOM_LEVELS_PERCENT } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const translator = createTranslator();
const STATUS_BAR = `footer[aria-label="${translator.translate('statusBar.label')}"]`;
const ZOOM_IN = `${STATUS_BAR} button[aria-label="${translator.translate('menu.view.zoomIn')}"]`;
const HIGHEST_ZOOM_PERCENT = ZOOM_LEVELS_PERCENT.at(-1) ?? 0;

function resetButton(zoomPercent: number): string {
  const label = translator.translate('statusBar.resetZoom', { percent: zoomPercent });
  return `${STATUS_BAR} button[aria-label="${label}"]`;
}

describe('zooming from the status bar', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function launchWithDocument() {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  }

  it('steps the zoom in and resets it from the value', async () => {
    await launchWithDocument();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await app.browser.$(ZOOM_IN).click();
    await app.browser.$(ZOOM_IN).click();
    await app.browser.$(resetButton(125)).waitForDisplayed();
    await app.browser.$(resetButton(125)).click();

    await app.browser.$(resetButton(100)).waitForDisplayed();
  });

  it('disables zoom in at the highest level and keeps focus in the stepper', async () => {
    await launchWithDocument();

    const stepsToHighest = ZOOM_LEVELS_PERCENT.filter((level) => level > 100).length;
    for (let step = 0; step < stepsToHighest; step += 1) {
      await app.browser.$(ZOOM_IN).click();
    }

    await app.browser.$(resetButton(HIGHEST_ZOOM_PERCENT)).waitForDisplayed();
    expect(await app.browser.$(ZOOM_IN).isEnabled()).toBe(false);
    expect(await app.browser.execute(() => document.activeElement?.getAttribute('aria-label'))).toBe(
      translator.translate('menu.view.zoomOut'),
    );
  });

  it('shows no stepper on the start page', async () => {
    app = await DesktopApp.launch({ workspace });
    await app.browser.$(`h1=${translator.translate('startPage.title')}`).waitForDisplayed();

    expect(await app.browser.$(ZOOM_IN).isExisting()).toBe(false);
  });
});
