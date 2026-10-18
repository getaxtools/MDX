import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('scripts inside a document', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('never runs script tags or event handlers from the document', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['script-in-document.md'] });
    const mainWindow = new MainWindowPage(app.browser);

    await mainWindow.documentHeading();

    expect(await mainWindow.documentText()).toContain('Text after the scripts.');
    expect(await mainWindow.renderedElements('script')).toHaveLength(0);
    expect(await mainWindow.renderedElements('[onerror]')).toHaveLength(0);
    expect(await mainWindow.windowTitle()).toBe('MDX - Markdown Explorer');
  });
});
