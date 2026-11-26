import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { ProtectedNotesPage } from '../../pages/ProtectedNotesPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'highContrast', label: 'High Contrast' },
] as const;

type Theme = (typeof THEMES)[number];

const WORKSPACE_FILE = 'handbook.mdxworkspace';
const PICKED_FOLDERS_VARIABLE = 'MDX_UI_TEST_PICKED_FOLDERS';
const INDEX_WAIT_MS = 10_000;
const FRAME = '[aria-modal="true"][aria-labelledby]';

interface OpeningContext {
  readonly browser: WebdriverIO.Browser;
  readonly mainWindow: MainWindowPage;
  readonly workspace: TestWorkspace;
  readonly theme: Theme;
}

interface DialogOpening {
  readonly name: string;
  readonly open: (context: OpeningContext) => Promise<void>;
}

async function runCommand(mainWindow: MainWindowPage, search: string, option: string): Promise<void> {
  await mainWindow.searchInCommandPalette(search);
  await mainWindow.waitForCommandPaletteOption(option);
  await mainWindow.pressShortcut('Enter');
}

function isFocusInsideFrame(): boolean {
  const frame = document.querySelector('[aria-modal="true"][aria-labelledby]');
  return frame?.contains(document.activeElement) ?? false;
}

const DIALOGS: readonly DialogOpening[] = [
  { name: 'About MDX', open: async ({ mainWindow }) => runCommand(mainWindow, '>about', 'About MDX') },
  { name: 'Keyboard Shortcuts', open: async ({ mainWindow }) => mainWindow.pressShortcut('F1') },
  {
    name: 'Word goal',
    open: async ({ mainWindow }) => runCommand(mainWindow, '>word goal', 'Set Word Goal'),
  },
  { name: 'Settings', open: async ({ mainWindow }) => mainWindow.pressShortcut('Ctrl+,') },
  {
    name: 'Paste Table from Excel',
    open: async ({ mainWindow }) => runCommand(mainWindow, '>paste table', 'Paste Table from Excel…'),
  },
  {
    name: 'Workspace file',
    open: async ({ workspace }) =>
      DesktopApp.launchSecondInstance({ workspace, documentFileNames: [WORKSPACE_FILE] }),
  },
  {
    name: 'New workspace',
    open: async ({ mainWindow }) => runCommand(mainWindow, '>new workspace', 'New Workspace…'),
  },
  {
    name: 'Rename workspace',
    open: async ({ mainWindow }) => runCommand(mainWindow, '>rename workspace', 'Rename Workspace…'),
  },
  {
    name: 'Clear All Data question',
    open: async ({ mainWindow }) => runCommand(mainWindow, '>clear all data', 'Clear All Data…'),
  },
];

const NOTES_DIALOGS: readonly DialogOpening[] = [
  {
    name: 'Protect Notes',
    open: async ({ browser, mainWindow }) => {
      await new ProtectedNotesPage(browser, mainWindow).startSetUp();
    },
  },
  {
    name: 'Trash',
    open: async ({ browser }) => browser.$('button[aria-label="Show Trash"]').click(),
  },
  {
    name: 'New Note from Template',
    open: async ({ mainWindow }) =>
      runCommand(mainWindow, '>new note from template', 'New Note from Template…'),
  },
  {
    name: 'Export All Notes',
    open: async ({ mainWindow }) => runCommand(mainWindow, '>export all notes', 'Export All Notes…'),
  },
];

function draftNoteName(theme: Theme): string {
  return `${theme.label} draft`;
}

async function renameLinkedDraft({ browser, mainWindow, theme }: OpeningContext): Promise<void> {
  const draft = draftNoteName(theme);
  await (await mainWindow.treeItem('notes.tree.title', draft)).click();
  await mainWindow.waitForBacklinksHeading('Linked from 1 note', INDEX_WAIT_MS);
  await mainWindow.pressKeyOn(await mainWindow.treeItem('notes.tree.title', draft), 'F2');
  const renameInput = browser.$(`input[aria-label="New name for ${draft}"]`);
  await renameInput.setValue(`${theme.label} plan`);
  await mainWindow.pressKeyOn(renameInput, 'Enter');
}

async function importEmptyFolderUntilReport({ browser, mainWindow }: OpeningContext): Promise<void> {
  await runCommand(mainWindow, '>import notes from a folder', 'Import Notes from a Folder…');
  const frame = browser.$(FRAME);
  await frame.waitForDisplayed();
  await frame.$('progress').waitForExist({ reverse: true });
}

const NOTES_ON_DISK_DIALOGS: readonly DialogOpening[] = [
  { name: 'Note Import report', open: importEmptyFolderUntilReport },
  { name: 'Note Link Updates', open: renameLinkedDraft },
];

describe('Dialogs share one frame', () => {
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
    };
    writeFileSync(workspace.documentPath(WORKSPACE_FILE), JSON.stringify(file));
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function checkEachDialogInEachTheme(
    mainWindow: MainWindowPage,
    dialogs: readonly DialogOpening[],
  ): Promise<void> {
    for (const theme of THEMES) {
      await runCommand(mainWindow, `>theme ${theme.label.toLowerCase()}`, `Theme: ${theme.label}`);
      await app.browser.waitUntil(async () =>
        app.browser.execute((id) => document.documentElement.dataset.theme === id, theme.id),
      );
      for (const dialog of dialogs) {
        await dialog.open({ browser: app.browser, mainWindow, workspace, theme });
        const frame = app.browser.$(FRAME);
        await frame.waitForDisplayed();
        const close = frame.$('header button[aria-label="Close"]');
        const context = `${dialog.name} in ${theme.label}`;

        expect(await close.getAttribute('title'), context).toBe('Close (Esc)');
        expect(await app.browser.execute(isFocusInsideFrame), context).toBe(true);
        expect(await findAccessibilityViolations(app.browser), context).toEqual([]);

        await mainWindow.pressShortcut('Escape');
        await frame.waitForExist({ reverse: true });
      }
    }
  }

  it('opens each dialog in light, dark and high contrast with a header close and no accessibility violations', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();

    await checkEachDialogInEachTheme(mainWindow, DIALOGS);
  });

  it('opens each notes dialog in light, dark and high contrast with a header close and no accessibility violations', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await new ProtectedNotesPage(app.browser, mainWindow).createNotesWorkspace('Journal');

    await checkEachDialogInEachTheme(mainWindow, NOTES_DIALOGS);
  });

  it('opens the note import report and the link updates preview in light, dark and high contrast with a header close and no accessibility violations', async () => {
    const notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(notesFolder, { recursive: true });
    for (const theme of THEMES) {
      const draft = draftNoteName(theme);
      writeFileSync(join(notesFolder, `${draft}.md`), `# ${draft}\n`);
      writeFileSync(join(notesFolder, `${theme.label} inbox.md`), `See [[${draft}]] today.\n`);
    }
    const emptyFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'mdx-frame-import-')));
    try {
      const pickedFolders = THEMES.map(() => emptyFolder).join(';');
      app = await DesktopApp.launch({ workspace, environment: { [PICKED_FOLDERS_VARIABLE]: pickedFolders } });
      const mainWindow = new MainWindowPage(app.browser);
      await mainWindow.emptyStateText();
      await new ProtectedNotesPage(app.browser, mainWindow).createNotesWorkspace('Journal', {
        holdsFiles: true,
      });

      await checkEachDialogInEachTheme(mainWindow, NOTES_ON_DISK_DIALOGS);
    } finally {
      rmSync(emptyFolder, { recursive: true, force: true });
    }
  });
});
