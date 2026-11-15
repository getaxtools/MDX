import { createTranslator } from '@mdx/i18n';
import type { ChainablePromiseElement } from 'webdriverio';
import type { MainWindowPage } from './MainWindowPage';

const translator = createTranslator();
const WHEEL_SELECTOR = `[role="dialog"][aria-label="${translator.translate('controlWheel.label')}"]`;
const KIND_SETTINGS_SELECTOR = '[role="dialog"][aria-labelledby="kind-settings-title"]';
const KIND_BAR_SELECTOR = `[role="group"][aria-label="${translator.translate('controlWheel.kinds.label')}"]`;
const GEAR_LABEL = translator.translate('controlWheel.gear.label');
/** The ring's outer radius in the units of its 200-unit view box. */
const RING_OUTER_RADIUS = 96;
const VIEW_BOX_SIZE = 200;
/** Long enough for any wheel motion, so a motion that never ends fails the test instead of hanging it. */
const MOTION_WAIT_LIMIT_MS = 2000;

export interface WheelSurfaceStyle {
  readonly backgroundOpacity: number;
  readonly backdropFilter: string;
  readonly isTransparencyReduced: boolean;
}

export interface SwitchAndRemovalTimes {
  readonly switchedAtMs: number;
  readonly removedAtMs: number;
}

interface PointerAlongSegment {
  /** How far past the ring's outer edge to point, or nothing for the middle of the segment. */
  readonly distanceBeyondOuterEdgePx: number | undefined;
  readonly shouldClick: boolean;
}

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

  async isMotionReduced(): Promise<boolean> {
    return this.browser.execute(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  async surfaceStyle(): Promise<WheelSurfaceStyle> {
    return this.browser.execute((wheelSelector) => {
      const surface = document.querySelector(`${wheelSelector} [data-testid="wheel-surface"]`);
      if (!surface) throw new Error('The wheel has no surface');
      const { backgroundColor, backdropFilter } = getComputedStyle(surface);
      const alphaMatch =
        /\/\s*([\d.]+)\s*\)$/.exec(backgroundColor) ?? /^rgba\(.*,\s*([\d.]+)\s*\)$/.exec(backgroundColor);
      const alpha = alphaMatch?.[1];
      return {
        backgroundOpacity: alpha === undefined ? 1 : Number(alpha),
        backdropFilter,
        isTransparencyReduced: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      };
    }, WHEEL_SELECTOR);
  }

  async litSegmentNames(): Promise<string[]> {
    return this.wheel()
      .$$('[role="menuitemradio"][data-lit="true"]')
      .map(async (segment) => (await segment.getAttribute('aria-label')) ?? '');
  }

  async captionText(): Promise<string> {
    return this.wheel().$('[data-testid="wheel-caption"]').getText();
  }

  /** Moves the pointer onto the middle of a segment, as a mouse would. */
  async pointAtSegment(name: string): Promise<void> {
    await this.dispatchPointerAlongSegment(name, {
      distanceBeyondOuterEdgePx: undefined,
      shouldClick: false,
    });
  }

  /** Clicks a spot past the outer edge of the ring, in the direction of a segment. */
  async clickBeyondOuterEdge(name: string, distancePx: number): Promise<void> {
    await this.dispatchPointerAlongSegment(name, {
      distanceBeyondOuterEdgePx: distancePx,
      shouldClick: true,
    });
  }

  /** Opens the closed wheel with the shortcut and measures until the last segment has finished appearing. */
  async openMotionMs(): Promise<number> {
    return this.browser.execute(
      (waitLimitMs) =>
        new Promise<number>((resolve) => {
          const startedAt = performance.now();
          function finishOnLastSegment(event: AnimationEvent) {
            const segments = document.querySelectorAll('[role="menuitemradio"]');
            if (event.target !== segments[segments.length - 1]) return;
            document.removeEventListener('animationend', finishOnLastSegment, true);
            resolve(performance.now() - startedAt);
          }
          document.addEventListener('animationend', finishOnLastSegment, true);
          setTimeout(() => resolve(Number.POSITIVE_INFINITY), waitLimitMs);
          const shortcut = { key: ' ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true };
          document.body.dispatchEvent(new KeyboardEvent('keydown', shortcut));
        }),
      MOTION_WAIT_LIMIT_MS,
    );
  }

  /** Clicks a segment and notes, frame by frame, when it is checked and when the wheel has gone. */
  async chooseSegmentAndTimeTheClose(name: string): Promise<SwitchAndRemovalTimes> {
    return this.browser.execute(
      (wheelSelector, segmentName, waitLimitMs) =>
        new Promise<SwitchAndRemovalTimes>((resolve, reject) => {
          const segmentSelector = `${wheelSelector} [role="menuitemradio"][aria-label="${segmentName}"]`;
          const segment = document.querySelector<HTMLElement>(segmentSelector);
          if (!segment) {
            reject(new Error(`No segment named ${segmentName}`));
            return;
          }
          const startedAt = performance.now();
          let switchedAtMs = Number.POSITIVE_INFINITY;
          function watch() {
            const elapsedMs = performance.now() - startedAt;
            const isChecked =
              document.querySelector(segmentSelector)?.getAttribute('aria-checked') === 'true';
            if (isChecked) switchedAtMs = Math.min(switchedAtMs, elapsedMs);
            if (!document.querySelector(wheelSelector) || elapsedMs > waitLimitMs) {
              resolve({ switchedAtMs, removedAtMs: elapsedMs });
              return;
            }
            requestAnimationFrame(watch);
          }
          segment.click();
          watch();
        }),
      WHEEL_SELECTOR,
      name,
      MOTION_WAIT_LIMIT_MS,
    );
  }

  private async dispatchPointerAlongSegment(name: string, pointer: PointerAlongSegment): Promise<void> {
    await this.browser.execute(
      ({ wheelSelector, segmentName, outerRadius, viewBoxSize, distanceBeyondOuterEdgePx, shouldClick }) => {
        const menu = document.querySelector(`${wheelSelector} [role="menu"]`);
        const segment = menu?.querySelector(`[role="menuitemradio"][aria-label="${segmentName}"]`);
        if (!menu || !segment) throw new Error(`No segment named ${segmentName}`);
        const bounds = menu.getBoundingClientRect();
        const icon = segment.getBoundingClientRect();
        const centre = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        const toward = { x: icon.left + icon.width / 2 - centre.x, y: icon.top + icon.height / 2 - centre.y };
        const iconDistance = Math.hypot(toward.x, toward.y);
        const outerEdgePx = (outerRadius * bounds.width) / viewBoxSize;
        const distance =
          distanceBeyondOuterEdgePx === undefined ? iconDistance : outerEdgePx + distanceBeyondOuterEdgePx;
        const clientX = centre.x + (toward.x / iconDistance) * distance;
        const clientY = centre.y + (toward.y / iconDistance) * distance;
        const target = document.elementFromPoint(clientX, clientY) ?? document.body;
        const at = { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, button: 0 };
        target.dispatchEvent(new PointerEvent('pointermove', at));
        if (!shouldClick) return;
        target.dispatchEvent(new PointerEvent('pointerdown', at));
        target.dispatchEvent(new PointerEvent('pointerup', at));
        target.dispatchEvent(new MouseEvent('click', at));
      },
      {
        wheelSelector: WHEEL_SELECTOR,
        segmentName: name,
        outerRadius: RING_OUTER_RADIUS,
        viewBoxSize: VIEW_BOX_SIZE,
        ...pointer,
      },
    );
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
