import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FIXTURE_PROJECTS_FOLDER = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'spec-projects',
  'ui',
);
const WORKSPACE_FILE = 'plans.mdxworkspace';
const SECTION_TITLE = 'specViewer.sidebar.title';
const DASHBOARD_TAB = 'Dashboard - documents';
const CHANGE_TASKS = 'openspec/changes/add-pins/tasks.md';
const RELOAD_TIMEOUT_MS = 15_000;

interface OpenedWorkspace {
  readonly workspace: TestWorkspace;
  readonly app: DesktopApp;
  readonly mainWindow: MainWindowPage;
}

/** Copies a fixture project into a new temporary folder and opens it as a Spec viewer workspace. */
async function openSpecWorkspace(fixture: 'change-based' | 'feature-numbered'): Promise<OpenedWorkspace> {
  const workspace = TestWorkspace.create();
  cpSync(join(FIXTURE_PROJECTS_FOLDER, fixture), workspace.documentsFolder, { recursive: true });
  const file = { format: 'mdx-workspace', formatVersion: 1, name: 'Plans', kind: 'specViewer', roots: ['.'] };
  writeFileSync(workspace.documentPath(WORKSPACE_FILE), JSON.stringify(file));
  const app = await DesktopApp.launch({ workspace, documentFileNames: [WORKSPACE_FILE] });
  const mainWindow = new MainWindowPage(app.browser);
  const confirmation = app.browser.$(
    './/*[@role="dialog"][.//h2[normalize-space(.)="Open the workspace Plans?"]]',
  );
  await confirmation.waitForDisplayed();
  await confirmation.$('button=Turn On Spec viewer and Open').click();
  await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Plans - MDX');
  return { workspace, app, mainWindow };
}

function dashboardRow(opened: OpenedWorkspace, name: string) {
  return opened.app.browser.$(`.//tr[th[normalize-space(.)="${name}"]]`);
}

async function rowText(opened: OpenedWorkspace, name: string): Promise<string> {
  return (await dashboardRow(opened, name).getText()).replace(/\s+/g, ' ');
}

describe('a Spec viewer workspace', () => {
  let opened: OpenedWorkspace;

  afterEach(async () => {
    await opened.app.quit();
    opened.workspace.remove();
  });

  describe('with a change-based project', () => {
    it('shows its spec projects in place of Folders, with task progress', async () => {
      opened = await openSpecWorkspace('change-based');
      const { app, mainWindow } = opened;
      await (await mainWindow.treeItem(SECTION_TITLE, 'add-pins')).waitForExist();

      expect(await mainWindow.hasSidebarSection('explorer.folders.title')).toBe(false);
      expect(await (await mainWindow.treeItem(SECTION_TITLE, 'add-pins')).getAttribute('aria-label')).toBe(
        'add-pins, 1 of 2 tasks done',
      );
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    });

    it('opens the dashboard and a change page with its problems', async () => {
      opened = await openSpecWorkspace('change-based');
      const { app, mainWindow } = opened;
      await (await mainWindow.treeItem(SECTION_TITLE, 'Dashboard')).click();
      await mainWindow.waitForActiveTab(DASHBOARD_TAB);
      await dashboardRow(opened, 'add-pins').waitForExist();
      expect(await rowText(opened, 'add-pins')).toContain('1 of 2');
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);

      await dashboardRow(opened, 'add-pins').$('button=add-pins').click();

      await mainWindow.waitForActiveTab('Change: add-pins');
      await app.browser
        .$(
          './/*[normalize-space(.)=\'Requirement "Pin tabs" must include at least one scenario with text.\']',
        )
        .waitForExist();
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    });

    it('previews the spec after a change and labels the delta sections of the delta', async () => {
      opened = await openSpecWorkspace('change-based');
      const { app, mainWindow } = opened;
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

    it('shows a ticked task on the dashboard and in the sidebar after another program saves it', async () => {
      opened = await openSpecWorkspace('change-based');
      const { app, mainWindow, workspace } = opened;
      await (await mainWindow.treeItem(SECTION_TITLE, 'Dashboard')).click();
      await mainWindow.waitForActiveTab(DASHBOARD_TAB);
      await dashboardRow(opened, 'add-pins').waitForExist();

      writeFileSync(
        workspace.documentPath(CHANGE_TASKS),
        '## 1. Pinning\n\n- [x] 1.1 Add the command\n- [x] 1.2 Keep pinned tabs first\n',
      );

      await app.browser.waitUntil(async () => (await rowText(opened, 'add-pins')).includes('2 of 2'), {
        timeout: RELOAD_TIMEOUT_MS,
      });
      expect(await (await mainWindow.treeItem(SECTION_TITLE, 'add-pins')).getAttribute('aria-label')).toBe(
        'add-pins, 2 of 2 tasks done',
      );
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    });
  });

  describe('with a feature-numbered project', () => {
    it('opens a feature page and links the story labels of its tasks to the feature spec', async () => {
      opened = await openSpecWorkspace('feature-numbered');
      const { app, mainWindow } = opened;
      await (await mainWindow.treeItem(SECTION_TITLE, '001-photo-albums')).click();
      await mainWindow.waitForActiveTab('Feature: 001-photo-albums');
      await app.browser.$('.//article//h1[normalize-space(.)="001-photo-albums"]').waitForExist();
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);

      await app.browser.$('.//article//button[normalize-space(.)="Tasks"]').click();
      await mainWindow.waitForActiveTab('tasks.md');
      const storyLink = app.browser.$('.//a[@data-mdx-link="document"][normalize-space(.)="[US1]"]');
      await storyLink.waitForExist();
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);

      await storyLink.click();

      await mainWindow.waitForActiveTab('spec.md');
      expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    });
  });
});
