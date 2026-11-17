import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import {
  downloadedSpellingDictionaries,
  outsideConnectionsOfTheApp,
  webviewProcessCount,
} from '../../support/appNetworkConnections';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const SPELLING_DOCUMENT = 'spelling.md';
const EDITOR = '.cm-content[role="textbox"]';
const RICH_TEXT_SETTING = '#setting-spellCheckInRichText';
/** Long enough for the webview to look up a dictionary it does not have. */
const NETWORK_WATCH_MS = 10_000;
/** Welsh: Windows has no spelling dictionary for it unless the user installs one. */
const LANGUAGE_WITHOUT_DICTIONARY = 'cy';

describe('checking spelling', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let userDataFolder: string | undefined;

  afterEach(async () => {
    await app.quit();
    workspace.remove();
    delete process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
    delete process.env.WEBVIEW2_USER_DATA_FOLDER;
    if (userDataFolder)
      rmSync(userDataFolder, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    userDataFolder = undefined;
  });

  async function openInEditor(text: string) {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(SPELLING_DOCUMENT), text);
    app = await DesktopApp.launch({ workspace, documentFileNames: [SPELLING_DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForActiveTab(SPELLING_DOCUMENT);
    await mainWindow.openEditor();
  }

  /** Whether the word sits in text the editor hands to the spell checker. */
  async function isWordChecked(word: string): Promise<boolean> {
    return app.browser.execute(
      (editorSelector, searched) => {
        const editor = document.querySelector(editorSelector);
        if (editor?.getAttribute('spellcheck') !== 'true') return false;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.includes(searched)) continue;
          return node.parentElement?.closest('[spellcheck="false"]') === null;
        }
        return false;
      },
      EDITOR,
      word,
    );
  }

  it('checks prose, leaves code alone, and the setting turns it off', async () => {
    await openInEditor('# Spelling\n\nThe word recieve is wrong.\n\nCall `recieveTeh` in code.\n');

    expect(await isWordChecked('recieve is')).toBe(true);
    expect(await isWordChecked('recieveTeh')).toBe(false);

    await mainWindow.pressShortcut('Ctrl+,');
    await app.browser.$(RICH_TEXT_SETTING).waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await app.browser.$(RICH_TEXT_SETTING).click();
    await mainWindow.pressShortcut('Escape');

    await app.browser.waitUntil(
      async () => (await app.browser.$(EDITOR).getAttribute('spellcheck')) === 'false',
    );
    expect(await isWordChecked('recieve is')).toBe(false);
  });

  it('makes no network request for a language without a Windows dictionary', async () => {
    // A data folder of its own, so the language does not stay in the shared one.
    userDataFolder = mkdtempSync(join(tmpdir(), 'mdx-spelling-'));
    process.env.WEBVIEW2_USER_DATA_FOLDER = userDataFolder;
    process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--accept-lang=${LANGUAGE_WITHOUT_DICTIONARY}`;
    await openInEditor('# Sillafu\n\nMae hwn yn ddogfen.\n');
    const folderName = basename(userDataFolder);
    const before = new Set(outsideConnectionsOfTheApp(folderName));

    await mainWindow.typeAtEndOfDocument(" Mae'r tywydd yn braf heddiw ac mae'r plant yn chwarae.");
    const seen = new Set<string>();
    const deadline = Date.now() + NETWORK_WATCH_MS;
    while (Date.now() < deadline)
      for (const connection of outsideConnectionsOfTheApp(folderName)) seen.add(connection);

    expect(webviewProcessCount(folderName)).toBeGreaterThan(0);
    expect(await isWordChecked('tywydd')).toBe(true);
    expect([...seen].filter((connection) => !before.has(connection))).toEqual([]);
    expect(downloadedSpellingDictionaries(userDataFolder)).toEqual([]);
  });
});
