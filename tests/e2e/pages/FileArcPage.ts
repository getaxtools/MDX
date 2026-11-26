import { createTranslator } from '@mdx/i18n';

const translator = createTranslator();
const ARC_LABEL_KEYS = { files: 'fileArc.label', notes: 'fileArc.notes.label' } as const;
const DOCUMENT_AREA_SELECTOR = '.reading-area main';
/** Longer than any open, so an arc that never shows fails the test instead of hanging it. */
const OPEN_WAIT_LIMIT_MS = 2000;

/**
 * Drives the file arc with the same synthetic events the embedded driver would send: it drops
 * the modifier state for special keys, and Ctrl has to stay held between steps.
 */
export class FileArcPage {
  private readonly arcSelector: string;
  private readonly openArcSelector: string;
  private readonly highlightedSelector: string;

  /** The arc of a Markdown viewer workspace moves between files, a Notes workspace's between notes. */
  constructor(
    private readonly browser: WebdriverIO.Browser,
    wording: keyof typeof ARC_LABEL_KEYS = 'files',
  ) {
    this.arcSelector = `[role="listbox"][aria-label="${translator.translate(ARC_LABEL_KEYS[wording])}"]`;
    this.openArcSelector = `${this.arcSelector}:not([inert])`;
    this.highlightedSelector = `${this.openArcSelector} [role="option"][aria-selected="true"]`;
  }

  async holdControl(): Promise<void> {
    await this.dispatchKey('keydown', { key: 'Control', ctrlKey: true });
  }

  async letGoOfControl(): Promise<void> {
    await this.dispatchKey('keyup', { key: 'Control' });
  }

  /** Ctrl+Down or Ctrl+Up while Ctrl is held. */
  async pressArrow(key: 'ArrowDown' | 'ArrowUp'): Promise<void> {
    await this.dispatchKey('keydown', { key, ctrlKey: true });
    await this.dispatchKey('keyup', { key, ctrlKey: true });
  }

  async pressWithControl(key: string): Promise<void> {
    await this.dispatchKey('keydown', { key, ctrlKey: true });
  }

  /** One notch of the mouse wheel over the document, down for a positive delta. */
  async turnWheelOverDocument(deltaY: number, isControlHeld = true): Promise<boolean> {
    return this.browser.execute(
      (selector, wheel) => {
        const area = document.querySelector(selector);
        if (!area) throw new Error('no document area');
        return area.dispatchEvent(new WheelEvent('wheel', { ...wheel, bubbles: true, cancelable: true }));
      },
      DOCUMENT_AREA_SELECTOR,
      { deltaY, ctrlKey: isControlHeld },
    );
  }

  async waitForOpen(): Promise<void> {
    await this.browser.$(this.openArcSelector).waitForDisplayed({ timeout: OPEN_WAIT_LIMIT_MS });
  }

  async waitForClosed(): Promise<void> {
    await this.browser.waitUntil(async () => !(await this.browser.$(this.arcSelector).isExisting()), {
      timeoutMsg: 'The file arc never closed',
    });
  }

  async isOpen(): Promise<boolean> {
    return this.browser.$(this.openArcSelector).isExisting();
  }

  /** The highlighted entry's file name, read from its accessible name `name, n of N`. */
  async highlightedName(): Promise<string> {
    const label = (await this.browser.$(this.highlightedSelector).getAttribute('aria-label')) ?? '';
    return label.split(', ')[0] ?? '';
  }

  /**
   * Milliseconds from Ctrl+Down to the highlighted card being painted, measured in the page so
   * the driver's own round trips do not count.
   */
  async timeToOpenMs(): Promise<number> {
    return this.browser.execute(
      (selector) =>
        new Promise<number>((resolve) => {
          const startedAt = performance.now();
          const target = document.activeElement ?? document.body;
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
          const waitForCard = () => {
            if (document.querySelector(selector))
              requestAnimationFrame(() => resolve(performance.now() - startedAt));
            else requestAnimationFrame(waitForCard);
          };
          waitForCard();
        }),
      this.highlightedSelector,
    );
  }

  private async dispatchKey(type: 'keydown' | 'keyup', init: KeyboardEventInit): Promise<void> {
    await this.browser.execute(
      (eventType, keyboardEvent) => {
        const target = document.activeElement ?? document.body;
        target.dispatchEvent(
          new KeyboardEvent(eventType, { ...keyboardEvent, bubbles: true, cancelable: true }),
        );
      },
      type,
      init,
    );
  }
}
