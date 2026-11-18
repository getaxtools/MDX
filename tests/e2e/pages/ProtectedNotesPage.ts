import { createTranslator, type MessageKey } from '@mdx/i18n';
import type { ChainablePromiseElement } from 'webdriverio';
import { ControlWheelPage } from './ControlWheelPage';
import type { MainWindowPage } from './MainWindowPage';

const translator = createTranslator();
const SECTION_SELECTOR = 'section[aria-labelledby="protected-notes-heading"]';
const DIALOG_SELECTOR = '[role="dialog"]';
/** Checking a password takes about a second on purpose; a slow test PC may need a few. */
const PASSWORD_CHECK_LIMIT_MS = 15_000;

function text(key: MessageKey): string {
  return translator.translate(key);
}

/** A Notes workspace with its protected section, driven as the user would. */
export class ProtectedNotesPage {
  constructor(
    private readonly browser: WebdriverIO.Browser,
    private readonly mainWindow: MainWindowPage,
  ) {}

  async createNotesWorkspace(name: string): Promise<void> {
    await this.turnOnNotes();
    await this.mainWindow.searchInCommandPalette('>New Workspace…');
    await this.mainWindow.waitForCommandPaletteOption('New Workspace…');
    await this.mainWindow.pressShortcut('Enter');
    const dialog = this.browser.$(DIALOG_SELECTOR);
    await dialog.$('input#workspace-name').setValue(name);
    await this.mainWindow.chooseOption(`${DIALOG_SELECTOR} select#workspace-kind`, 'notes');
    await dialog.$('[role="group"][aria-labelledby="notes-location-label"] code').waitForDisplayed();
    await this.mainWindow.confirmNotesFolder({ holdsFiles: false });
    await dialog.$('button=Create').click();
    await this.browser.waitUntil(async () => (await this.mainWindow.windowTitle()) === `${name} - MDX`);
  }

  section(): ChainablePromiseElement {
    return this.browser.$(SECTION_SELECTOR);
  }

  /** The section's heading, such as "Protected notes Unlocked". */
  async headingName(): Promise<string> {
    const heading = this.section().$('h2');
    await heading.waitForDisplayed();
    return (await heading.getText()).replaceAll(/\s+/g, ' ').trim();
  }

  async waitForState(
    stateKey: 'protectedNotes.section.locked' | 'protectedNotes.section.unlocked',
  ): Promise<void> {
    const expected = `${text('protectedNotes.section.title')} ${text(stateKey)}`;
    await this.browser.waitUntil(async () => (await this.headingName()) === expected, {
      timeout: PASSWORD_CHECK_LIMIT_MS,
      timeoutMsg: `The protected section did not become "${text(stateKey)}"`,
    });
  }

  async startSetUp(): Promise<ChainablePromiseElement> {
    await this.section()
      .$(`button=${text('protectedNotes.section.protectNotes')}`)
      .click();
    const dialog = this.browser.$(DIALOG_SELECTOR);
    await dialog.waitForDisplayed();
    return dialog;
  }

  async choosePassword(password: string): Promise<void> {
    const dialog = this.browser.$(DIALOG_SELECTOR);
    await dialog.$(`button=${text('protectedNotes.setUp.continue')}`).click();
    await dialog.$('#protected-password').setValue(password);
    await dialog.$('#protected-password-again').setValue(password);
    await dialog.$(`button=${text('protectedNotes.setUp.create')}`).click();
  }

  /** Waits for the recovery key that set-up shows once, and returns it. */
  async shownRecoveryKey(): Promise<string> {
    const key = this.browser.$(`${DIALOG_SELECTOR} .recovery-key code`);
    await key.waitForDisplayed({ timeout: PASSWORD_CHECK_LIMIT_MS });
    return key.getText();
  }

  async confirmRecoveryKeyEnd(typedEnd: string): Promise<void> {
    const dialog = this.browser.$(DIALOG_SELECTOR);
    await dialog.$('#protected-recovery-end').setValue(typedEnd);
    await dialog.$(`button=${text('protectedNotes.setUp.finish')}`).click();
  }

  async isDialogOpen(): Promise<boolean> {
    return this.browser.$(DIALOG_SELECTOR).isExisting();
  }

  /** Sets up the section with a password, confirms the recovery key and returns it. */
  async setUp(password: string): Promise<string> {
    await this.startSetUp();
    await this.choosePassword(password);
    const recoveryKey = await this.shownRecoveryKey();
    await this.confirmRecoveryKeyEnd(recoveryKey.split('-').slice(-2).join('-'));
    await this.browser.waitUntil(async () => !(await this.isDialogOpen()));
    await this.waitForState('protectedNotes.section.unlocked');
    return recoveryKey;
  }

  private async turnOnNotes(): Promise<void> {
    const controlWheel = new ControlWheelPage(this.browser, this.mainWindow);
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await this.browser.waitUntil(async () => !(await controlWheel.isOpen()));
  }
}
