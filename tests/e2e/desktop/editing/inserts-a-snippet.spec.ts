import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'faq.md';

async function typeText(app: DesktopApp, text: string): Promise<void> {
  await app.browser.execute((typed) => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- still the only way to insert text as an input method does
    document.execCommand('insertText', false, typed);
  }, text);
}

describe('snippets', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Questions\n\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.startEditing();
    await mainWindow.typeAtEndOfDocument('');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('insert a snippet from the palette and fill two fields', async () => {
    await mainWindow.searchInCommandPalette('>Insert Snippet: Toggle');
    await mainWindow.waitForCommandPaletteOption('Insert Snippet: Toggle');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Enter');
    await app.browser.waitUntil(async () => !(await app.browser.$('[role="dialog"]').isExisting()));

    await typeText(app, 'Can I export?');
    await mainWindow.pressShortcut('Tab');
    await typeText(app, 'Yes.');
    await mainWindow.pressShortcut('Ctrl+S');

    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Questions\n\n> [!NOTE]- Can I export?\n> Yes.',
    );
  });
});
