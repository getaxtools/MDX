import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTranslator } from '@mdx/i18n';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const translator = createTranslator();

describe('the start page', () => {
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

  it('greets an empty window and starts a new document in the editor', async () => {
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await app.browser.$(`h1=${translator.translate('startPage.title')}`).waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await app.browser.$(`button=${translator.translate('menu.file.newDocument')}`).click();

    await app.browser.$('[role="textbox"][aria-label="Source of Untitled-1.md"]').waitForDisplayed();
  });

  it('reopens a recent file from the start page', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.closeTab('getting-started.md');

    await app.browser.$('button=getting-started.md').click();

    await mainWindow.waitForTabs(['getting-started.md']);
  });
});
