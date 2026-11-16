import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const WORKSPACE_FILE = 'plans.mdxworkspace';
const SECTION_TITLE = 'specViewer.sidebar.title';

const PROJECT_FILES: Readonly<Record<string, string>> = {
  'openspec/config.yaml': 'schema: spec-driven\n',
  'openspec/specs/tabs/spec.md': [
    '# tabs Specification',
    '',
    '## Purpose',
    '',
    'Lets a user keep several documents open at once in tabs.',
    '',
    '## Requirements',
    '',
    '### Requirement: Open tabs',
    'The viewer SHALL open each document in its own tab.',
    '',
    '#### Scenario: Open a file',
    '- **WHEN** the user opens a file',
    '- **THEN** it appears in a new tab',
    '',
  ].join('\n'),
  'openspec/changes/add-pins/.openspec.yaml': 'schema: spec-driven\ncreated: 2026-11-12\n',
  'openspec/changes/add-pins/proposal.md': '# Pin tabs\n\nPinned tabs stay first.\n',
  'openspec/changes/add-pins/tasks.md':
    '## 1. Pinning\n\n- [x] 1.1 Add the command\n- [ ] 1.2 Keep pinned tabs first\n',
  'openspec/changes/add-pins/specs/tabs/spec.md': [
    '## ADDED Requirements',
    '',
    '### Requirement: Pin tabs',
    'The viewer SHALL let the user pin a tab.',
    '',
  ].join('\n'),
};

describe('a Spec viewer workspace', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    for (const [path, text] of Object.entries(PROJECT_FILES)) {
      const fullPath = workspace.documentPath(path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, text);
    }
    const file = {
      format: 'mdx-workspace',
      formatVersion: 1,
      name: 'Plans',
      kind: 'specViewer',
      roots: ['.'],
    };
    writeFileSync(workspace.documentPath(WORKSPACE_FILE), JSON.stringify(file));
    app = await DesktopApp.launch({ workspace, documentFileNames: [WORKSPACE_FILE] });
    mainWindow = new MainWindowPage(app.browser);
    const confirmation = app.browser.$(
      './/*[@role="dialog"][.//h2[normalize-space(.)="Open the workspace Plans?"]]',
    );
    await confirmation.waitForDisplayed();
    await confirmation.$('button=Turn On Spec viewer and Open').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Plans - MDX');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows its spec projects in place of Folders, with task progress', async () => {
    await (await mainWindow.treeItem(SECTION_TITLE, 'add-pins')).waitForExist();

    expect(await mainWindow.hasSidebarSection('explorer.folders.title')).toBe(false);
    expect(await (await mainWindow.treeItem(SECTION_TITLE, 'add-pins')).getAttribute('aria-label')).toBe(
      'add-pins, 1 of 2 tasks done',
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('opens the dashboard and a change page with its problems', async () => {
    await (await mainWindow.treeItem(SECTION_TITLE, 'Dashboard')).click();
    await mainWindow.waitForActiveTab('Dashboard - documents');
    const row = app.browser.$('.//tr[th[normalize-space(.)="add-pins"]]');
    await row.waitForExist();
    expect((await row.getText()).replace(/\s+/g, ' ')).toContain('1 of 2');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await row.$('button=add-pins').click();

    await mainWindow.waitForActiveTab('Change: add-pins');
    await app.browser
      .$('.//*[normalize-space(.)=\'Requirement "Pin tabs" must include at least one scenario with text.\']')
      .waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('previews the spec after a change and labels the delta sections of the delta', async () => {
    await (await mainWindow.treeItem(SECTION_TITLE, 'add-pins')).click();
    await mainWindow.waitForActiveTab('Change: add-pins');

    await app.browser.$('button=Spec after this change: tabs').click();

    await mainWindow.waitForActiveTab('After add-pins: tabs');
    const added = app.browser.$(
      './/li[contains(normalize-space(.), "Pin tabs") and .//span[normalize-space(.)="Added"]]',
    );
    await added.waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);

    await mainWindow.activateTab('Change: add-pins');
    await app.browser.$('button=Spec delta: tabs').click();
    await mainWindow.waitForActiveTab('spec.md');
    await app.browser.$('section.mdx-spec-delta-added[aria-label="Added"]').waitForExist();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
