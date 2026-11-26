import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'visual.md';
const EQUATION_DIALOG = '[role="dialog"][aria-labelledby="equation-dialog-title"]';
const APP_HOSTS = new Set(['tauri.localhost', 'ipc.localhost', 'mdx-image.localhost']);

interface WatchedWindow {
  mdxPolicyViolations?: string[];
}

describe('the Visual tab', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Visual\n\nArea is ');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Visual');
    await app.browser.execute(() => {
      const watched = globalThis as WatchedWindow;
      watched.mdxPolicyViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        watched.mdxPolicyViolations?.push(`${event.effectiveDirective} ${event.blockedURI}`);
      });
    });
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+End');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function openVisualTab(): Promise<void> {
    await mainWindow.pressShortcut('Alt+=');
    await app.browser.$(EQUATION_DIALOG).waitForDisplayed();
    await mainWindow.typeInFocusedField('x^2');
    await mainWindow.pressWithPointer(app.browser.$('[role="tab"][aria-controls="equation-panel-visual"]'));
    await app.browser.$('#equation-panel-visual math-field').waitForDisplayed();
    await app.browser.waitUntil(async () =>
      app.browser.execute(() => document.activeElement?.localName === 'math-field'),
    );
  }

  it('editing in the Visual tab makes no request', async () => {
    await openVisualTab();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.typeInFocusedField('+1');
    const texSource = () =>
      app.browser.execute(
        () => document.querySelector('[role="textbox"][aria-label="TeX source"]')?.textContent ?? '',
      );
    await app.browser.waitUntil(async () => (await texSource()).includes('+1'));
    const source = await texSource();
    await mainWindow.pressWithPointer(app.browser.$(`${EQUATION_DIALOG} button.primary`));
    await app.browser.$(EQUATION_DIALOG).waitForExist({ reverse: true });
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);

    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(`# Visual\n\nArea is $${source}$`);
    const loadedUrls = await app.browser.execute(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    expect(loadedUrls.filter((url) => !APP_HOSTS.has(new URL(url).hostname))).toEqual([]);
    expect(await app.browser.execute(() => (globalThis as WatchedWindow).mdxPolicyViolations)).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('draws with the KaTeX fonts the app ships and keeps the dialog keys', async () => {
    await openVisualTab();
    const fonts = await app.browser.execute(() => ({
      isMainFontReady: document.fonts.check('16px KaTeX_Main'),
      hasMissingFonts: document.body.classList.contains('ML__fonts-did-not-load'),
      fontAddresses: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.endsWith('.woff2')),
    }));

    await mainWindow.pressShortcut('Escape');

    await app.browser.$(EQUATION_DIALOG).waitForExist({ reverse: true });
    expect(fonts.isMainFontReady).toBe(true);
    expect(fonts.hasMissingFonts).toBe(false);
    expect(fonts.fontAddresses.length).toBeGreaterThan(0);
    expect(
      fonts.fontAddresses.every((address) => /\/assets\/KaTeX_[A-Za-z0-9-]+-[\w-]+\.woff2$/.test(address)),
    ).toBe(true);
    expect(await app.browser.execute(() => (globalThis as WatchedWindow).mdxPolicyViolations)).toEqual([]);
  });
});
