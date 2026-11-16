import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { PromptInjectionPanelPage } from '../../pages/PromptInjectionPanelPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'joined-letters.md';

/** Hidden characters are written as escapes, so this file never holds them itself. */
function joinedLettersDocument(): string {
  return ['# Joined letters', '', 'a\u200Db and a family \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', ''].join(
    '\n',
  );
}

describe('Show hidden characters', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), joinedLettersDocument());
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('draws markers in the preview and the editor, and stays on after a restart', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    let mainWindow = new MainWindowPage(app.browser);
    let panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.waitForDocumentHeading('Joined letters');

    await panel.toggleHiddenCharactersFromCommandPalette();

    await app.browser.waitUntil(async () => (await panel.previewMarkerNames()).length > 0);
    expect(await panel.previewMarkerNames()).toEqual(['zero width joiner']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.startEditing();
    await app.browser.waitUntil(async () => (await panel.editorChipNames()).length > 0);
    expect(await panel.editorChipNames()).toEqual(['zero width joiner']);
    await mainWindow.pressShortcut('Ctrl+/');
    await app.browser.waitUntil(() => workspace.isShowingHiddenCharactersInSavedState());
    await app.quit();

    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    panel = new PromptInjectionPanelPage(app.browser);
    await mainWindow.waitForDocumentHeading('Joined letters');

    await app.browser.waitUntil(async () => (await panel.previewMarkerNames()).length > 0);
    expect(await panel.previewMarkerNames()).toEqual(['zero width joiner']);
  });
});
