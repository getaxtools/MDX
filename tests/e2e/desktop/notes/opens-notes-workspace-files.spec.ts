import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const WORKSPACE_FILE = 'journal.mdxworkspace';

describe('opening a Notes workspace file', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    const file = {
      format: 'mdx-workspace',
      formatVersion: 1,
      name: 'Journal',
      kind: 'notes',
      roots: ['notes-on-another-machine'],
    };
    writeFileSync(workspace.documentPath(WORKSPACE_FILE), JSON.stringify(file));
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('open a Notes workspace file, choose its folder, the tree shows', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: [WORKSPACE_FILE] });
    const mainWindow = new MainWindowPage(app.browser);
    const confirmation = app.browser.$(
      './/*[@role="dialog"][.//h2[normalize-space(.)="Open the workspace Journal?"]]',
    );
    await confirmation.waitForDisplayed();
    await confirmation.$('button=Turn On Notes and Open').click();

    const folderStep = app.browser.$(
      '[role="dialog"] [role="group"][aria-labelledby="notes-location-label"]',
    );
    await folderStep.$('code').waitForDisplayed();
    expect(await app.browser.$('[role="dialog"] input#workspace-name').getValue()).toBe('Journal');
    expect(await app.browser.$('[role="dialog"] select#workspace-kind').isExisting()).toBe(false);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await app.browser.$('[role="dialog"]').$('button=Create').click();

    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Journal - MDX');
    await app.browser.waitUntil(async () => mainWindow.hasSidebarSection('notes.tree.title'));
    expect(existsSync(join(workspace.homeDocumentsFolder, 'MDX Notes'))).toBe(true);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
