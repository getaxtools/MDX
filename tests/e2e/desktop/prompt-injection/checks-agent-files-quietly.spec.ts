import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { PromptInjectionPanelPage } from '../../pages/PromptInjectionPanelPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

/** An agent instruction file name the checker recognizes; any of them gets the automatic check. */
const AGENT_FILE = 'GEMINI.md';
const NORMAL_README = 'README.md';

/** Hidden characters are written as escapes, so this file never holds them itself. */
function agentInstructions(): string {
  return ['# Agent notes', '', 'Build with care.\u{E0068}\u{E0069}', ''].join('\n');
}

describe('the automatic prompt injection check', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(AGENT_FILE), agentInstructions());
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows a badge for an agent file without any dialog, and opens the panel from it', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [AGENT_FILE] });
    const mainWindow = new MainWindowPage(app.browser);
    const panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.waitForDocumentHeading('Agent notes');

    await panel.badge().waitForExist();

    expect(await panel.badgeName()).toMatch(/^1 finding, highest High/);
    expect(await app.browser.$('[role="dialog"]').isExisting()).toBe(false);
    expect(await panel.panel().isExisting()).toBe(false);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await app.browser.execute((badge) => badge.click(), await panel.badge().getElement());
    await panel.panel().waitForDisplayed();
  });

  it('shows no badge for a normal README under the default setting', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [NORMAL_README] });
    const mainWindow = new MainWindowPage(app.browser);
    const panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.documentHeading();

    await mainWindow.waitForStatusBarText('Encoding');

    expect(await panel.badge().isExisting()).toBe(false);
  });

  it('keeps an ignored finding ignored after a restart', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [AGENT_FILE] });
    let mainWindow = new MainWindowPage(app.browser);
    let panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.waitForDocumentHeading('Agent notes');
    await panel.runCheckFromCommandPalette();
    await panel.waitForSummary('highest High');
    await panel.ignoreFinding('Invisible tag characters', 3);
    await panel.waitForIgnoredCount(1);
    await app.browser.waitUntil(() => workspace.savedIgnoreEntryCount() === 1);
    await app.quit();

    app = await DesktopApp.launch({ workspace, documentFileNames: [AGENT_FILE] });
    mainWindow = new MainWindowPage(app.browser);
    panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.waitForDocumentHeading('Agent notes');
    await panel.runCheckFromCommandPalette();

    await panel.waitForIgnoredCount(1);
    expect(await panel.panel().$('.summary').getText()).toBe('Found nothing we check for.');
  });
});
