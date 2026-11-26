import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const WORKSPACE_FILE = 'handbook.mdxworkspace';

describe('opening a workspace file', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    const file = {
      format: 'mdx-workspace',
      formatVersion: 1,
      name: 'Handbook',
      kind: 'markdownViewer',
      roots: ['.'],
      favourites: [{ path: 'release-notes.md', kind: 'file' }],
    };
    writeFileSync(workspace.documentPath(WORKSPACE_FILE), JSON.stringify(file));
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('open a workspace file shows the confirmation, and Open shows the workspace', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [WORKSPACE_FILE] });
    const mainWindow = new MainWindowPage(app.browser);
    const confirmation = app.browser.$(
      './/*[@role="dialog"][.//h2[normalize-space(.)="Open the workspace Handbook?"]]',
    );
    await confirmation.waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await confirmation.$('button=Open').click();

    await mainWindow.waitForFavourites(['release-notes.md']);
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Handbook - MDX');
  });

  it('opening the same file again switches to its workspace without asking', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [WORKSPACE_FILE] });
    const firstRun = new MainWindowPage(app.browser);
    const confirmation = app.browser.$(
      './/*[@role="dialog"][.//h2[normalize-space(.)="Open the workspace Handbook?"]]',
    );
    await confirmation.waitForDisplayed();
    await confirmation.$('button=Open').click();
    await app.browser.waitUntil(async () => (await firstRun.windowTitle()) === 'Handbook - MDX');
    await firstRun.pressShortcut('Ctrl+Alt+W');
    await app.browser.$('[role="dialog"] [role="combobox"]').setValue('Default');
    await firstRun.pressShortcut('Enter');
    await app.browser.waitUntil(async () => (await firstRun.windowTitle()) === 'Default - MDX');
    await app.quit();

    app = await DesktopApp.launch({ workspace, documentFileNames: [WORKSPACE_FILE] });
    const secondRun = new MainWindowPage(app.browser);

    await app.browser.waitUntil(async () => (await secondRun.windowTitle()) === 'Handbook - MDX');
    expect(await app.browser.$('[role="dialog"]').isExisting()).toBe(false);
  });
});
