import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'highContrast', label: 'High Contrast' },
] as const;

interface DialogOpening {
  readonly name: string;
  readonly open: (mainWindow: MainWindowPage) => Promise<void>;
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
  { name: 'About MDX', open: async (mainWindow) => runCommand(mainWindow, '>about', 'About MDX') },
];

describe('Dialogs share one frame', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('opens each dialog in light, dark and high contrast with a header close and no accessibility violations', async () => {
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();

    for (const theme of THEMES) {
      await runCommand(mainWindow, `>theme ${theme.label.toLowerCase()}`, `Theme: ${theme.label}`);
      await app.browser.waitUntil(async () =>
        app.browser.execute((id) => document.documentElement.dataset.theme === id, theme.id),
      );
      for (const dialog of DIALOGS) {
        await dialog.open(mainWindow);
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
  });
});
