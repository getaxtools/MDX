import { createTranslator, type MessageKey } from '@mdx/i18n';

const translator = createTranslator();

export class MainWindowPage {
  constructor(private readonly browser: WebdriverIO.Browser) {}

  async tabNames(): Promise<string[]> {
    return this.browser.$$('[role="tab"]').map(async (tab) => (await tab.getText()).trim());
  }

  async activeTabName(): Promise<string> {
    return (await this.browser.$('[role="tab"][aria-selected="true"]').getText()).trim();
  }

  async waitForTabs(expectedNames: readonly string[]): Promise<void> {
    await this.waitForNames('tabs', () => this.tabNames(), expectedNames);
  }

  async waitForActiveTab(expectedName: string): Promise<void> {
    await this.browser.waitUntil(async () => (await this.activeTabName()) === expectedName, {
      timeoutMsg: `Expected ${expectedName} to be the active tab`,
    });
  }

  async activateTab(fileName: string): Promise<void> {
    const tabs = await this.browser
      .$$('[role="tab"]')
      .filter(async (tab) => (await tab.getText()).trim() === fileName);
    const [tab] = tabs;
    if (!tab) throw new Error(`No tab is named ${fileName}`);
    await tab.click();
  }

  async closeTab(fileName: string): Promise<void> {
    await this.browser
      .$(`[role="tablist"] [title="${translator.translate('tabs.closeTab', { fileName })}"]`)
      .click();
  }

  /** Presses a shortcut such as `Ctrl+Shift+Tab` in the focused part of the window. */
  async pressShortcut(shortcut: string): Promise<void> {
    // The embedded driver drops modifier state for special keys such as Tab, so dispatch the same
    // synthetic events it would send, with the modifiers set.
    await this.browser.execute((keyboardEvent) => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent('keydown', { ...keyboardEvent, bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(new KeyboardEvent('keyup', { ...keyboardEvent, bubbles: true, cancelable: true }));
    }, keyboardEventFor(shortcut));
  }

  async documentHeading(): Promise<string> {
    const heading = this.browser.$('main article h1');
    await heading.waitForDisplayed();
    return heading.getText();
  }

  async waitForDocumentHeading(expectedHeading: string): Promise<void> {
    await this.browser.waitUntil(
      async () =>
        (await this.browser
          .$('main article h1')
          .getText()
          .catch(() => '')) === expectedHeading,
      { timeout: 10_000, timeoutMsg: `The document heading never became "${expectedHeading}"` },
    );
  }

  async documentText(): Promise<string> {
    return this.browser.$('main article').getText();
  }

  async renderedElements(elementSelector: string): Promise<WebdriverIO.ElementArray> {
    return this.browser.$('main article').$$(elementSelector).getElements();
  }

  /** Waits for content that appears after the first render, such as typeset math or a drawn diagram. */
  async waitForRenderedElement(elementSelector: string): Promise<void> {
    await this.browser.$('main article').$(elementSelector).waitForExist({ timeout: 15_000 });
  }

  async renderedTexts(elementSelector: string): Promise<string[]> {
    const elements = await this.renderedElements(elementSelector);
    return Promise.all(Array.from(elements, async (element) => (await element.getText()).trim()));
  }

  async windowTitle(): Promise<string> {
    return this.browser.getTitle();
  }

  async emptyStateText(): Promise<string> {
    return this.browser.$('main p').getText();
  }

  async toggleFavourite(): Promise<void> {
    await this.toolbarButton('favourites.toggle').click();
  }

  async isActiveTabFavourite(): Promise<boolean> {
    return (await this.toolbarButton('favourites.toggle').getAttribute('aria-pressed')) === 'true';
  }

  async favouriteNames(): Promise<string[]> {
    return this.sidebarEntryNames('favourites.sidebar.title');
  }

  async waitForFavourites(expectedNames: readonly string[]): Promise<void> {
    await this.waitForNames('favourites', () => this.favouriteNames(), expectedNames);
  }

  async openFavourite(name: string): Promise<void> {
    const section = await this.sidebarSection('favourites.sidebar.title');
    await section.$(`button*=${name}`).click();
  }

  async recentFileNames(): Promise<string[]> {
    return this.sidebarEntryNames('recentFiles.title');
  }

  async openRecentFile(fileName: string): Promise<void> {
    const section = await this.sidebarSection('recentFiles.title');
    await section.$(`button=${fileName}`).click();
  }

  private async waitForNames(
    what: string,
    currentNames: () => Promise<string[]>,
    expectedNames: readonly string[],
  ): Promise<void> {
    let lastNames: string[] = [];
    try {
      await this.browser.waitUntil(async () => {
        lastNames = await currentNames();
        return haveSameItems(lastNames, expectedNames);
      });
    } catch {
      throw new Error(`Expected the ${what} ${expectedNames.join(', ')}, found ${lastNames.join(', ')}`);
    }
  }

  private toolbarButton(labelKey: MessageKey) {
    return this.browser.$('[role="toolbar"]').$(`button*=${translator.translate(labelKey)}`);
  }

  private async sidebarSection(titleKey: MessageKey) {
    const title = translator.translate(titleKey);
    const sections = await this.browser
      .$(`nav[aria-label="${translator.translate('sidebar.label')}"]`)
      .$$('section')
      .filter(async (section) => (await section.$('h2').getProperty('textContent')) === title);
    const [section] = sections;
    if (!section) throw new Error(`The sidebar has no ${title} section`);
    return section;
  }

  private async sidebarEntryNames(titleKey: MessageKey): Promise<string[]> {
    const section = await this.sidebarSection(titleKey);
    const names = await section.$$('li > button').map((button) => button.getText());
    return names.map((name) => name.replace('★', '').trim());
  }
}

function haveSameItems(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function keyboardEventFor(shortcut: string): KeyboardEventInit {
  const parts = shortcut.split('+');
  const key = parts.at(-1) ?? '';
  const hasShift = parts.includes('Shift');
  return {
    key: key.length === 1 && !hasShift ? key.toLowerCase() : key,
    ctrlKey: parts.includes('Ctrl'),
    shiftKey: hasShift,
    altKey: parts.includes('Alt'),
  };
}
