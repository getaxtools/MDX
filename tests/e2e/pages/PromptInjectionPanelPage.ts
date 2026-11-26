import type { ChainablePromiseElement } from 'webdriverio';
import { createTranslator } from '@mdx/i18n';
import { MainWindowPage } from './MainWindowPage';

const translator = createTranslator();

/** The findings panel of the prompt injection check, in the side bar. */
export class PromptInjectionPanelPage {
  private readonly mainWindow: MainWindowPage;

  constructor(private readonly browser: WebdriverIO.Browser) {
    this.mainWindow = new MainWindowPage(browser);
  }

  panel(): ChainablePromiseElement {
    return this.browser.$('section[aria-labelledby="prompt-injection-heading"]');
  }

  async runCheckFromCommandPalette(): Promise<void> {
    const commandName = translator.translate('promptInjection.command.check');
    await this.mainWindow.searchInCommandPalette(`>${commandName}`);
    await this.mainWindow.waitForCommandPaletteOption(commandName);
    await this.mainWindow.pressShortcut('Enter');
    await this.panel().waitForDisplayed();
  }

  /** The status bar badge; it exists only once the shown document has been checked. */
  badge(): ChainablePromiseElement {
    return this.browser.$('footer .injection-badge');
  }

  async badgeName(): Promise<string> {
    return (await this.badge().getAttribute('aria-label')) ?? '';
  }

  async ignoreFinding(ruleTitle: string, line: number): Promise<void> {
    const name = translator.translate('promptInjection.finding.ignoreLabel', { rule: ruleTitle, line });
    const button = await this.panel().$(`button[aria-label="${name}"]`).getElement();
    await this.browser.execute((target) => target.click(), button);
  }

  async waitForIgnoredCount(count: number): Promise<void> {
    const text = translator.translate('promptInjection.panel.ignoredCount', { count });
    await this.panel().$(`span=${text}`).waitForExist();
  }

  async toggleHiddenCharactersFromCommandPalette(): Promise<void> {
    const commandName = translator.translate('promptInjection.hiddenCharacters.toggle');
    await this.mainWindow.searchInCommandPalette(`>${commandName}`);
    await this.mainWindow.waitForCommandPaletteOption(commandName);
    await this.mainWindow.pressShortcut('Enter');
  }

  /** The accessible names of the hidden character markers in the rendered document. */
  async previewMarkerNames(): Promise<string[]> {
    return this.browser.execute(() =>
      [...document.querySelectorAll('main article .mdx-hidden-character')].map(
        (marker) => marker.getAttribute('aria-label') ?? '',
      ),
    );
  }

  async editorChipNames(): Promise<string[]> {
    return this.browser.execute(() =>
      [...document.querySelectorAll('.cm-editor .cm-hidden-character')].map(
        (chip) => chip.getAttribute('aria-label') ?? '',
      ),
    );
  }

  async waitForSummary(expectedPart: string): Promise<void> {
    await this.browser.waitUntil(
      async () => (await this.panel().$('.summary').getText()).includes(expectedPart),
      {
        timeoutMsg: `The panel never summed up the findings as "${expectedPart}"`,
      },
    );
  }

  async ruleTitles(): Promise<string[]> {
    return this.panel()
      .$$('li.finding .rule')
      .map(async (rule) => (await rule.getText()).trim());
  }

  /** Activates a finding from inside the page, as the embedded driver moves focus back after its own clicks. */
  async activateFinding(ruleTitle: string): Promise<void> {
    const rule = `contains(concat(" ", normalize-space(@class), " "), " rule ")`;
    const button = this.panel().$(
      `.//li[contains(@class, "finding")]/button[.//span[${rule} and normalize-space(.)="${ruleTitle}"]]`,
    );
    await button.waitForExist();
    await this.browser.execute((target) => target.click(), await button.getElement());
  }

  /** The live region is visually hidden, so its text is read from the page rather than the screen. */
  async announcement(): Promise<string> {
    const liveRegion = await this.panel().$('[role="status"]').getElement();
    return this.browser.execute((element) => element.textContent, liveRegion);
  }

  async isSourceRangeOutlined(): Promise<boolean> {
    return this.browser.execute(() => CSS.highlights.has('mdx-source-range'));
  }

  async outlinedSourceText(): Promise<string> {
    return this.browser.execute(() => {
      const highlight = CSS.highlights.get('mdx-source-range');
      const [range] = highlight ? [...highlight] : [];
      return range instanceof Range ? range.toString() : '';
    });
  }
}
