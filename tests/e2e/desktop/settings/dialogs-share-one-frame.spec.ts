import { writeFileSync } from 'node:fs';
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

const WORKSPACE_FILE = 'handbook.mdxworkspace';

interface OpeningContext {
  readonly browser: WebdriverIO.Browser;
  readonly mainWindow: MainWindowPage;
  readonly workspace: TestWorkspace;
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
  const frame = document.querySelector('[role="dialog"][aria-labelledby="dialog-title"]');
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
        await dialog.open({ browser: app.browser, mainWindow, workspace });
        const frame = app.browser.$('[role="dialog"][aria-labelledby="dialog-title"]');
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
});
