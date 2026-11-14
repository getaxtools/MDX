import { createTranslator } from '@mdx/i18n';
import type { ChainablePromiseElement } from 'webdriverio';
import type { MainWindowPage } from './MainWindowPage';

const translator = createTranslator();
const WHEEL_SELECTOR = `[role="dialog"][aria-label="${translator.translate('controlWheel.label')}"]`;
const KIND_SETTINGS_SELECTOR = '[role="dialog"][aria-labelledby="kind-settings-title"]';
const KIND_BAR_SELECTOR = `[role="group"][aria-label="${translator.translate('controlWheel.kinds.label')}"]`;
const GEAR_LABEL = translator.translate('controlWheel.gear.label');

export class ControlWheelPage {
  constructor(
    private readonly browser: WebdriverIO.Browser,
    private readonly mainWindow: MainWindowPage,
  ) {}

  wheel(): ChainablePromiseElement {
    return this.browser.$(WHEEL_SELECTOR);
  }

  kindSettings(): ChainablePromiseElement {
    return this.browser.$(KIND_SETTINGS_SELECTOR);
  }

  kindBar(): ChainablePromiseElement {
    return this.browser.$(KIND_BAR_SELECTOR);
  }

  async openControlWheel(shortcut = 'Ctrl+Shift+Space'): Promise<void> {
    await this.mainWindow.pressShortcut(shortcut);
    await this.wheel().waitForDisplayed();
  }

  async isOpen(): Promise<boolean> {
    return this.wheel().isExisting();
  }

  async wheelSegmentNames(): Promise<string[]> {
    return this.wheel()
      .$$('[role="menuitemradio"]')
      .map(async (segment) => (await segment.getAttribute('aria-label')) ?? '');
  }

  async checkedSegmentName(): Promise<string> {
    return (
      (await this.wheel().$('[role="menuitemradio"][aria-checked="true"]').getAttribute('aria-label')) ?? ''
    );
  }

  async focusedSegmentName(): Promise<string> {
    return this.browser.execute(() =>
      document.activeElement?.getAttribute('role') === 'menuitemradio'
        ? (document.activeElement.getAttribute('aria-label') ?? '')
        : '',
    );
  }

  /** Clicks inside the segment's sector, as a mouse would. */
  async chooseWheelSegment(name: string): Promise<void> {
    const segment = await this.wheel().$(`[role="menuitemradio"][aria-label="${name}"]`).getElement();
    await this.browser.execute((target) => target.click(), segment);
  }

  async pressInWheel(key: string): Promise<void> {
    await this.mainWindow.pressShortcut(key);
  }

  async openKindSettings(): Promise<void> {
    const gear = await this.wheel().$(`button[aria-label="${GEAR_LABEL}"]`).getElement();
    await this.browser.execute((target) => target.click(), gear);
    await this.kindSettings().waitForDisplayed();
  }

  /** Turns a kind on or off in the open kind choices; nothing happens if it is already so. */
  async setKindEnabled(name: string, isEnabled: boolean): Promise<void> {
    const kindSwitch = await this.kindSwitch(name);
    if ((await kindSwitch.getAttribute('aria-checked')) === String(isEnabled)) return;
    await this.browser.execute((target) => target.click(), kindSwitch);
    await this.browser.waitUntil(
      async () => (await kindSwitch.getAttribute('aria-checked')) === String(isEnabled),
    );
  }

  async kindSwitchState(name: string): Promise<{ isChecked: boolean; isDisabled: boolean; reason: string }> {
    const kindSwitch = await this.kindSwitch(name);
    const reasonId = await kindSwitch.getAttribute('aria-describedby');
    return {
      isChecked: (await kindSwitch.getAttribute('aria-checked')) === 'true',
      isDisabled: (await kindSwitch.getAttribute('aria-disabled')) === 'true',
      reason: reasonId ? await this.browser.$(`#${reasonId}`).getText() : '',
    };
  }

  async chooseKindInBar(name: string): Promise<void> {
    const button = await this.kindBar().$(`button[aria-label="${name}"]`).getElement();
    await this.browser.execute((target) => target.click(), button);
  }

  async pressedKindInBar(): Promise<string> {
    return (await this.kindBar().$('button[aria-pressed="true"]').getAttribute('aria-label')) ?? '';
  }

  private async kindSwitch(name: string): Promise<WebdriverIO.Element> {
    const switches = await this.kindSettings()
      .$$('[role="switch"]')
      .filter(async (candidate) =>
        String(await candidate.getProperty('textContent'))
          .trim()
          .startsWith(name),
      );
    const [kindSwitch] = switches;
    if (!kindSwitch) throw new Error(`No kind switch named ${name}`);
    return kindSwitch;
  }
}
