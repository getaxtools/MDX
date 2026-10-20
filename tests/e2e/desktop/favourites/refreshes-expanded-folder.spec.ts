import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const FIXTURE_ENTRIES = [
  'getting-started.md',
  'gfm-showcase.md',
  'math.md',
  'README.md',
  'release-notes.md',
  'script-in-document.md',
];

describe('an expanded folder favourite', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    workspace.saveDocumentsFolderAsFavourite();
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.expandFavouriteFolder('documents');
    await mainWindow.waitForFolderEntries('documents', FIXTURE_ENTRIES);
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('lists documents and subfolders added by other programs', async () => {
    writeFileSync(workspace.documentPath('added-later.md'), '# Added later\n');
    mkdirSync(workspace.documentPath('guides'));

    await mainWindow.waitForFolderEntries('documents', ['guides', 'added-later.md', ...FIXTURE_ENTRIES]);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('shows the new name of a renamed document', async () => {
    renameSync(workspace.documentPath('math.md'), workspace.documentPath('formulas.md'));

    await mainWindow.waitForFolderEntries('documents', [
      'formulas.md',
      ...FIXTURE_ENTRIES.filter((name) => name !== 'math.md'),
    ]);
  });

  it('drops a document deleted by another program', async () => {
    rmSync(workspace.documentPath('release-notes.md'));

    await mainWindow.waitForFolderEntries(
      'documents',
      FIXTURE_ENTRIES.filter((name) => name !== 'release-notes.md'),
    );
  });
});
