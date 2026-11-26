import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'pythagoras.md';
const APP_HOSTS = new Set(['tauri.localhost', 'ipc.localhost', 'mdx-image.localhost']);
const WEB_PAGE_SAMPLE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'clipboard',
  'synthetic-wikipedia-tex-annotation',
);

function sample(extension: string): string {
  return readFileSync(`${WEB_PAGE_SAMPLE}${extension}`, 'utf8').replace(/\n$/, '');
}

describe('pasting formulas', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Pythagoras\n\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Pythagoras');
    await mainWindow.openEditor();
    await mainWindow.pressShortcut('Ctrl+End');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('pasting a web page formula inserts display math that renders, with no request', async () => {
    await mainWindow.pasteIntoFocusedEditor({ 'text/plain': sample('.txt'), 'text/html': sample('.html') });

    await app.browser.$('.cm-formula-paste-notice').waitForDisplayed();
    expect(await app.browser.$('.cm-formula-paste-notice').getText()).toContain('Pasted as equation');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      `# Pythagoras\n\n${sample('.expected.md')}`,
    );
    await mainWindow.pressShortcut('Ctrl+Home');
    await app.browser.$('[role="img"][aria-label="Formula a^{2}+b^{2}=c^{2}"] .katex').waitForExist();

    const loadedUrls = await app.browser.execute(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    expect(loadedUrls.filter((url) => !APP_HOSTS.has(new URL(url).hostname))).toEqual([]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
