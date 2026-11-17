import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

/** Debug builds answer the folder picker with these folders, one per pick. */
const PICKED_FOLDERS_VARIABLE = 'MDX_UI_TEST_PICKED_FOLDERS';
const PLAN_WITH_BLOCK_REFERENCE = '# Plan\r\n\r\nSee [[Plan#^a1b2]].\r\n';

function writeFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

describe('importing and exporting notes', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;
  let outsideFolder: string;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    outsideFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'mdx-notes-io-')));
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
    rmSync(outsideFolder, { recursive: true, force: true });
  });

  async function startWithPickedFolder(folder: string): Promise<void> {
    app = await DesktopApp.launch({ workspace, environment: { [PICKED_FOLDERS_VARIABLE]: folder } });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    const controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    await runFromPalette('New Workspace…');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue('Journal');
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await mainWindow.confirmNotesFolder({ holdsFiles: false });
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === 'Journal - MDX');
  }

  async function runFromPalette(label: string): Promise<void> {
    await mainWindow.searchInCommandPalette(`>${label}`);
    await mainWindow.waitForCommandPaletteOption(label);
    await mainWindow.pressShortcut('Enter');
  }

  it('imports a vault-style folder byte for byte, keeps the existing note and reports what is not supported', async () => {
    const vault = join(outsideFolder, 'Vault');
    writeFile(join(vault, 'Plan.md'), PLAN_WITH_BLOCK_REFERENCE);
    writeFile(join(vault, '.app-settings', 'app.json'), '{}');
    await startWithPickedFolder(vault);
    writeFile(join(notesFolder, 'Plan.md'), '# Mine\n');

    await runFromPalette('Import Notes from a Folder…');

    const report = app.browser.$('[role="dialog"]');
    await report.$('h3=Not supported here').waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    expect(await report.getText()).toContain('Plan.md was saved as Plan (imported).md');
    expect(await report.getText()).toContain('block reference Plan#^a1b2');
    expect(readFileSync(join(notesFolder, 'Plan (imported).md'), 'utf8')).toBe(PLAN_WITH_BLOCK_REFERENCE);
    expect(readFileSync(join(notesFolder, 'Plan.md'), 'utf8')).toBe('# Mine\n');
    expect(existsSync(join(notesFolder, '.app-settings'))).toBe(false);
    expect(readFileSync(join(vault, 'Plan.md'), 'utf8')).toBe(PLAN_WITH_BLOCK_REFERENCE);
  });

  it('exports a folder with its attachments, byte for byte', async () => {
    const destination = join(outsideFolder, 'Exports');
    mkdirSync(destination);
    await startWithPickedFolder(destination);
    writeFile(join(notesFolder, 'Projects', 'Plan.md'), 'See [[Budget]] and ![chart](chart.png).\r\n');
    writeFile(join(notesFolder, 'Projects', 'chart.png'), 'not really a picture');
    writeFile(join(notesFolder, 'Finance', 'Budget.md'), '# Budget\n');
    const projects = await mainWindow.treeItem('notes.tree.title', 'Projects');

    await mainWindow.openContextMenuOn(projects);
    await mainWindow.chooseMenuItem('notes.tree.export');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('button=Choose Folder…').click();
    await dialog.$(`span=${destination}`).waitForDisplayed();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await dialog.$('button=Export').click();

    await dialog.$('p*=files were exported').waitForDisplayed();
    expect(readFileSync(join(destination, 'Projects', 'Plan.md'), 'utf8')).toBe(
      'See [[Budget]] and ![chart](chart.png).\r\n',
    );
    expect(readFileSync(join(destination, 'Projects', 'chart.png'), 'utf8')).toBe('not really a picture');
    expect(existsSync(join(destination, 'Finance'))).toBe(false);
  });
});
