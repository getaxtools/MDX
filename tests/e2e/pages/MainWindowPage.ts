import type { ChainablePromiseElement } from 'webdriverio';
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

  /** The rendered heading, looked up again on every try because opening documents re-renders it. */
  async documentHeading(): Promise<string> {
    let headingText = '';
    await this.browser.waitUntil(
      async () => {
        headingText = await this.browser
          .$('main article h1')
          .getText()
          .catch(() => '');
        return headingText !== '';
      },
      { timeoutMsg: 'The document never showed a heading' },
    );
    return headingText;
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
    await section.$(treeItemContaining(name)).click();
  }

  async expandFavouriteFolder(name: string): Promise<void> {
    const folder = await this.favouriteButton(name);
    if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click();
  }

  async waitForFolderEntries(folderName: string, expectedNames: readonly string[]): Promise<void> {
    await this.waitForNames(
      `entries of ${folderName}`,
      () => this.folderEntryNames(folderName),
      expectedNames,
    );
  }

  async waitForExplorerFolderEntries(folderName: string, expectedNames: readonly string[]): Promise<void> {
    await this.waitForNames(
      `entries of ${folderName}`,
      async () => this.entryNamesBelow(await this.explorerFolderButton(folderName)),
      expectedNames,
    );
  }

  async startEditing(): Promise<void> {
    await this.pressShortcut('Ctrl+/');
    await this.browser.$('[role="textbox"][aria-label^="Source of"]').waitForDisplayed();
  }

  /**
   * Types into the source editor at the end of the document. The embedded driver's key events never
   * reach the editor's text, so the text goes in the way an input method inserts it.
   */
  async typeAtEndOfDocument(text: string): Promise<void> {
    await this.browser.$('[role="textbox"][aria-label^="Source of"]').click();
    await this.pressShortcut('Ctrl+End');
    await this.browser.execute((typedText) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- still the only way to insert text as an input method does
      document.execCommand('insertText', false, typedText);
    }, text);
  }

  async waitForUnsavedTab(fileName: string): Promise<void> {
    await this.activeUnsavedTab(fileName).waitForExist();
  }

  async waitForSavedTab(fileName: string): Promise<void> {
    await this.activeUnsavedTab(fileName).waitForExist({ reverse: true });
  }

  async answerUnsavedChanges(labelKey: MessageKey): Promise<void> {
    await this.browser
      .$('[role="alertdialog"]')
      .$(`button=${translator.translate(labelKey)}`)
      .click();
  }

  private activeUnsavedTab(fileName: string) {
    const hint = translator.translate('tabs.status.unsavedHint');
    return this.browser.$(
      `//*[@role="tab"][@aria-selected="true"][contains(., "${fileName}")][contains(., "${hint}")]`,
    );
  }

  /** Right-clicks an element the way the mouse would, so its own context menu opens. */
  async openContextMenuOn(element: ChainablePromiseElement): Promise<void> {
    await element.waitForExist();
    const resolvedElement = await element.getElement();
    await this.browser.execute((target) => {
      const bounds = target.getBoundingClientRect();
      target.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + 4,
          clientY: bounds.top + 4,
        }),
      );
    }, resolvedElement);
  }

  async chooseMenuItem(labelKey: MessageKey, values?: Record<string, string>): Promise<void> {
    const label = translator.translate(labelKey, values);
    await this.browser
      .$(`.//*[@role="menu"]//button[@role="menuitem"][contains(normalize-space(.), "${label}")]`)
      .click();
  }

  tab(fileName: string): ChainablePromiseElement {
    return this.browser.$(`//*[@role="tab"][contains(normalize-space(.), "${fileName}")]`);
  }

  /** Picks an option the way the native drop-down does; the embedded driver cannot open that pop-up. */
  async chooseOption(selectSelector: string, value: string): Promise<void> {
    await this.browser.execute(
      (selector, optionValue) => {
        const select = document.querySelector<HTMLSelectElement>(selector);
        if (!select) throw new Error(`No drop-down ${selector}`);
        select.value = optionValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      },
      selectSelector,
      value,
    );
  }

  async treeItem(sectionTitleKey: MessageKey, name: string): Promise<ChainablePromiseElement> {
    const section = await this.sidebarSection(sectionTitleKey);
    return section.$(treeItemContaining(name));
  }

  async waitForNotice(messageKey: MessageKey, values: Record<string, string>): Promise<void> {
    const message = translator.translate(messageKey, values);
    await this.browser.$(`.//*[@aria-live="polite"]//span[normalize-space(.)="${message}"]`).waitForExist();
  }

  async clickNoticeAction(labelKey: MessageKey): Promise<void> {
    await this.browser
      .$('[aria-live="polite"]')
      .$(`button=${translator.translate(labelKey)}`)
      .click();
  }

  async statusBarText(): Promise<string> {
    return this.browser.$(`footer[aria-label="${translator.translate('statusBar.label')}"]`).getText();
  }

  async waitForStatusBarText(expectedPart: string): Promise<void> {
    await this.browser.waitUntil(async () => (await this.statusBarText()).includes(expectedPart), {
      timeoutMsg: `The status bar never showed "${expectedPart}"`,
    });
  }

  /** Scrolls the document view to a place from 0 (top) to 1 (end). */
  async scrollDocumentTo(scrollRatio: number): Promise<void> {
    await this.browser.execute((ratio) => {
      const area = document.querySelector('main');
      if (!area) return;
      area.scrollTop = ratio * (area.scrollHeight - area.clientHeight);
      area.dispatchEvent(new Event('scroll'));
    }, scrollRatio);
  }

  async documentScrollTop(): Promise<number> {
    return this.browser.execute(() => document.querySelector('main')?.scrollTop ?? 0);
  }

  outline(): ChainablePromiseElement {
    return this.browser.$(`nav[aria-labelledby="outline-heading"]`);
  }

  async showOutline(): Promise<void> {
    await this.pressShortcut('Ctrl+Shift+O');
    await this.outline().waitForDisplayed();
  }

  async chooseOutlineHeading(text: string): Promise<void> {
    await this.clickInPage(this.outline().$(`button=${text}`));
  }

  /** Clicks from inside the page; the embedded driver moves focus back to what it clicked itself. */
  private async clickInPage(element: ChainablePromiseElement): Promise<void> {
    await this.browser.execute((target) => (target as HTMLElement).click(), await element.getElement());
  }

  async waitForCurrentOutlineHeading(text: string): Promise<void> {
    await this.outline().$(`button[aria-current="location"]=${text}`).waitForExist();
  }

  async clickDocumentLink(text: string): Promise<void> {
    await this.clickInPage(this.browser.$('main article').$(`a=${text}`));
  }

  /** How far the source editor is scrolled, and whether the keyboard focus is in its text. */
  async editorState(): Promise<{ readonly scrollTop: number; readonly hasFocus: boolean }> {
    return this.browser.execute(() => ({
      scrollTop: document.querySelector('.cm-scroller')?.scrollTop ?? 0,
      hasFocus: document.activeElement?.closest('.cm-content') !== null,
    }));
  }

  /** Presses a key on one element, whatever has the focus. */
  async pressKeyOn(element: ChainablePromiseElement, key: string): Promise<void> {
    await this.browser.execute(
      (target, pressedKey) => {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key: pressedKey, bubbles: true, cancelable: true }),
        );
      },
      await element.getElement(),
      key,
    );
  }

  /** Double-clicks an element; the embedded driver has no double-click of its own. */
  async doubleClick(element: ChainablePromiseElement): Promise<void> {
    await this.browser.execute(
      (target) => target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
      await element.getElement(),
    );
  }

  splitter(labelKey: MessageKey): ChainablePromiseElement {
    return this.browser.$(`[role="separator"][aria-label="${translator.translate(labelKey)}"]`);
  }

  async splitterValue(labelKey: MessageKey): Promise<number> {
    return Number(await this.splitter(labelKey).getAttribute('aria-valuenow'));
  }

  /** Drags a splitter sideways by a number of pixels, as the mouse would. */
  async dragSplitter(labelKey: MessageKey, movementPx: number): Promise<void> {
    const splitter = await this.splitter(labelKey).getElement();
    await this.browser.execute(
      (target, movement) => {
        const bounds = target.getBoundingClientRect();
        const pointer = { bubbles: true, pointerId: 1, button: 0, clientY: bounds.top + 10 };
        target.setPointerCapture = () => undefined;
        target.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: bounds.left }));
        target.dispatchEvent(
          new PointerEvent('pointermove', { ...pointer, clientX: bounds.left + movement }),
        );
        target.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: bounds.left + movement }));
      },
      splitter,
      movementPx,
    );
  }

  toolbarToggle(labelKey: MessageKey): ChainablePromiseElement {
    return this.toolbarButton(labelKey);
  }

  /** The rendered preview shown beside the source editor. */
  previewBesideEditor(): ChainablePromiseElement {
    return this.browser.$(`section[aria-label="${translator.translate('editing.previewBeside.label')}"]`);
  }

  async searchInCommandPalette(text: string): Promise<void> {
    await this.pressShortcut('Ctrl+Shift+P');
    const searchBox = this.browser.$('[role="dialog"] [role="combobox"]');
    await searchBox.waitForDisplayed();
    await searchBox.setValue(text);
  }

  async waitForCommandPaletteOption(name: string): Promise<void> {
    await this.browser.$(`.//li[@role="option"][contains(normalize-space(.), "${name}")]`).waitForExist();
  }

  async isExplorerVisible(): Promise<boolean> {
    return this.browser.$(`nav[aria-label="${translator.translate('sidebar.label')}"]`).isExisting();
  }

  async focusExplorerFolder(name: string): Promise<void> {
    const folder = await this.explorerFolderButton(name);
    await this.browser.execute((row) => {
      row.focus();
    }, folder);
  }

  async focusedTreeItemName(): Promise<string> {
    return this.browser.execute(() => document.activeElement?.textContent.trim() ?? '');
  }

  async waitForSelectedExplorerEntry(expectedName: string): Promise<void> {
    const section = await this.sidebarSection('explorer.folders.title');
    await section
      .$(`.//div[@role="treeitem"][@aria-selected="true"][contains(normalize-space(.), "${expectedName}")]`)
      .waitForExist();
  }

  async toggleExplorerSection(titleKey: MessageKey): Promise<void> {
    const section = await this.sidebarSection(titleKey);
    await section.$('h2 button').click();
  }

  async isExplorerSectionExpanded(titleKey: MessageKey): Promise<boolean> {
    const section = await this.sidebarSection(titleKey);
    return (await section.$('h2 button').getAttribute('aria-expanded')) === 'true';
  }

  async recentFileNames(): Promise<string[]> {
    return this.sidebarEntryNames('recentFiles.title');
  }

  async openRecentFile(fileName: string): Promise<void> {
    const section = await this.sidebarSection('recentFiles.title');
    await section.$(treeItemContaining(fileName)).click();
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

  private async folderEntryNames(folderName: string): Promise<string[]> {
    return this.entryNamesBelow(await this.favouriteButton(folderName));
  }

  private async explorerFolderButton(name: string) {
    const section = await this.sidebarSection('explorer.folders.title');
    return section.$(treeItemContaining(name));
  }

  private async entryNamesBelow(folder: ChainablePromiseElement): Promise<string[]> {
    return folder
      .$$('./following-sibling::ul/li/div[@role="treeitem"]')
      .map(async (entry) => (await entry.getText()).trim());
  }

  private async favouriteButton(name: string) {
    const section = await this.sidebarSection('favourites.sidebar.title');
    return section.$(treeItemContaining(name));
  }

  private toolbarButton(labelKey: MessageKey) {
    return this.browser.$('[role="toolbar"]').$(`button*=${translator.translate(labelKey)}`);
  }

  private async sidebarSection(titleKey: MessageKey) {
    const title = translator.translate(titleKey);
    const sections = await this.browser
      .$(`nav[aria-label="${translator.translate('sidebar.label')}"]`)
      .$$('section')
      .filter(async (section) => String(await section.$('h2').getProperty('textContent')).trim() === title);
    const [section] = sections;
    if (!section) throw new Error(`The sidebar has no ${title} section`);
    return section;
  }

  private async sidebarEntryNames(titleKey: MessageKey): Promise<string[]> {
    const section = await this.sidebarSection(titleKey);
    return section.$$('li > [role="treeitem"]').map(async (row) => (await row.getText()).trim());
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

function treeItemContaining(name: string): string {
  return `.//div[@role="treeitem"][contains(normalize-space(.), "${name}")]`;
}
