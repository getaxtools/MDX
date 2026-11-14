import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'essay.md';

describe('word goals', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(DOCUMENT), '# Essay\n\nOne two three.\n');
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.startEditing();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('set a goal from the status bar and reach it', async () => {
    const wordsButton = await app.browser.$('footer button.words').getElement();
    await app.browser.execute((button) => button.click(), wordsButton);
    const goal = app.browser.$('#word-goal');
    await goal.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await goal.setValue('6');
    await app.browser.execute(() =>
      document.querySelector<HTMLFormElement>('[role="dialog"] form')?.requestSubmit(),
    );
    await mainWindow.waitForStatusBarText('4 of 6 words');
    await mainWindow.typeAtEndOfDocument('Four five.');

    await mainWindow.waitForStatusBarText('Word goal reached.');
  });
});
