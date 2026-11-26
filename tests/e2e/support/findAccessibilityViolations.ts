import AxeBuilder from '@axe-core/webdriverio';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SETTLE_TIMEOUT_MS = 5000;

export interface AccessibilityViolation {
  readonly rule: string;
  readonly targets: readonly string[];
}

// A colour caught halfway through a fade fails the contrast rule, so measure once every finite animation has ended.
async function waitForAnimationsToSettle(browser: WebdriverIO.Browser): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              !Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? Infinity)),
          ),
      ),
    {
      timeout: SETTLE_TIMEOUT_MS,
      timeoutMsg: 'an animation was still running before the accessibility check',
    },
  );
}

export async function findAccessibilityViolations(
  browser: WebdriverIO.Browser,
): Promise<AccessibilityViolation[]> {
  await waitForAnimationsToSettle(browser);
  // The embedded driver cannot open the extra window that axe's default mode needs; the app has no frames anyway.
  const results = await new AxeBuilder({ client: browser }).withTags(WCAG_TAGS).setLegacyMode(true).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    targets: violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
  }));
}
