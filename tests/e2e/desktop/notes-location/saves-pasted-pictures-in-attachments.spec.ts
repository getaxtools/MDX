import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x70, 0x69, 0x63];

describe('pictures pasted into a note', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let notesFolder: string;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    notesFolder = join(workspace.homeDocumentsFolder, 'MDX Notes');
    mkdirSync(join(notesFolder, 'Projects'), { recursive: true });
    writeFileSync(join(notesFolder, 'Projects', 'Plan.md'), '# Plan\n');
    app = await DesktopApp.launch({ workspace });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.emptyStateText();
    await turnOnNotes();
    await createNotesWorkspace('Journal');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function turnOnNotes(): Promise<void> {
    const controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
  }

  async function createNotesWorkspace(name: string): Promise<void> {
    await mainWindow.searchInCommandPalette('>New Workspace…');
    await mainWindow.waitForCommandPaletteOption('New Workspace…');
    await mainWindow.pressShortcut('Enter');
    const dialog = app.browser.$('[role="dialog"]');
    await dialog.$('input#workspace-name').setValue(name);
    await mainWindow.chooseOption('[role="dialog"] select#workspace-kind', 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await mainWindow.confirmNotesFolder({ holdsFiles: true });
    await dialog.$('button=Create').click();
    await app.browser.waitUntil(async () => (await mainWindow.windowTitle()) === `${name} - MDX`);
  }

  /** Pastes picture bytes the way the clipboard hands a copied picture to the editor. */
  async function pastePicture(bytes: readonly number[]): Promise<void> {
    await app.browser.execute((pictureBytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(pictureBytes)], 'image.png', { type: 'image/png' }));
      const editor = document.querySelector('[role="textbox"][aria-label^="Source of"]');
      editor?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    }, bytes);
  }

  it('a pasted image lands in Attachments', async () => {
    const attachments = join(notesFolder, 'Attachments');
    expect(existsSync(attachments)).toBe(false);
    await mainWindow.searchInCommandPalette('Plan.md');
    await mainWindow.waitForCommandPaletteOption('Plan.md');
    await mainWindow.pressShortcut('Enter');
    await mainWindow.waitForDocumentHeading('Plan');
    await mainWindow.startEditing();

    await pastePicture(PNG_BYTES);

    await app.browser.waitUntil(() => existsSync(attachments) && readdirSync(attachments).length === 1);
    const [savedName = ''] = readdirSync(attachments);
    expect([...readFileSync(join(attachments, savedName))]).toEqual(PNG_BYTES);
    const editor = app.browser.$('[role="textbox"][aria-label^="Source of"]');
    await app.browser.waitUntil(async () => (await editor.getText()).includes('](../Attachments/'));
    expect(readdirSync(join(notesFolder, 'Projects'))).toEqual(['Plan.md']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
