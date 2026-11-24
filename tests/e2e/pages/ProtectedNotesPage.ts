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

  /** Types the password into the unlock panel, ticking Remember on this PC when asked to. */
  async enterPassword(password: string, { shouldRemember = false } = {}): Promise<void> {
    const section = this.section();
    const field = section.$('#protected-unlock-password');
    await field.waitForDisplayed();
    await field.setValue(password);
    if (shouldRemember) await section.$(`label=${text('protectedNotes.unlock.remember')}`).click();
    await section.$(`button=${text('protectedNotes.unlock.unlock')}`).click();
  }

  async unlock(password: string, options: { readonly shouldRemember?: boolean } = {}): Promise<void> {
    await this.enterPassword(password, options);
    await this.waitForState('protectedNotes.section.unlocked');
  }

  /** The problem the unlock panel reports, once it reports one. */
  async unlockProblem(): Promise<string> {
    const problem = this.section().$('#protected-unlock-problem');
    await this.browser.waitUntil(async () => (await problem.getText()) !== '', {
      timeout: PASSWORD_CHECK_LIMIT_MS,
    });
    return problem.getText();
  }

  async hasPasswordField(): Promise<boolean> {
    return this.section().$('#protected-unlock-password').isDisplayed();
  }

  async createNote(title: string): Promise<void> {
    await this.section()
      .$(`button[aria-label="${text('protectedNotes.section.newNote')}"]`)
      .click();
    const field = this.section().$(`input[aria-label="${text('protectedNotes.section.newNoteTitle')}"]`);
    await field.setValue(title);
    await this.mainWindow.pressKeyOn(field, 'Enter');
    await this.mainWindow.waitForActiveTab(title);
    await this.browser.waitUntil(async () => (await this.mainWindow.editorState()).hasFocus, {
      timeoutMsg: `The new note "${title}" never took the keyboard focus`,
    });
  }

  async noteTitles(): Promise<string[]> {
    return this.section()
      .$$('ul button')
      .map((button) => button.getText());
  }

  async waitForNoteTitles(expectedTitles: readonly string[]): Promise<void> {
    await this.browser.waitUntil(
      async () => (await this.noteTitles()).join('|') === expectedTitles.join('|'),
      {
        timeoutMsg: `The protected notes are not ${expectedTitles.join(', ')}`,
      },
    );
  }

  async openNote(title: string): Promise<void> {
    await this.section().$('ul').$(`button=${title}`).click();
    await this.mainWindow.waitForActiveTab(title);
  }

  /** The folder warning shown in place of the notes, once it shows. */
  async folderWarning(): Promise<string> {
    const warning = this.section().$('[role="alert"]');
    await warning.waitForDisplayed({ timeout: PASSWORD_CHECK_LIMIT_MS });
    return warning.getText();
  }

  async keepFolder(): Promise<void> {
    await this.section()
      .$(`button=${text('protectedNotes.folderWarning.keep')}`)
      .click();
  }

  async lockFromHeader(): Promise<void> {
    await this.section()
      .$(`button[aria-label="${text('protectedNotes.lock.command')}"]`)
      .click();
    await this.waitForState('protectedNotes.section.locked');
  }

  async lockFromStatusBar(): Promise<void> {
    await this.browser
      .$(
        `footer[aria-label="${text('statusBar.label')}"] button[aria-label="${text('protectedNotes.lock.command')}"]`,
      )
      .click();
  }

  /** Unlocks a section this PC remembers, with its one Unlock button. */
  async unlockOnThisPc(): Promise<void> {
    await this.section()
      .$(`p=${text('protectedNotes.unlock.rememberedHere')}`)
      .waitForDisplayed();
    await this.section()
      .$(`button=${text('protectedNotes.unlock.unlock')}`)
      .click();
  }

  async forgetThisPc(): Promise<void> {
    await this.section()
      .$(`button=${text('protectedNotes.unlock.forgetThisPc')}`)
      .click();
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
