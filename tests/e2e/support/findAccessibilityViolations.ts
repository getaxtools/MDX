import AxeBuilder from '@axe-core/webdriverio';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface AccessibilityViolation {
  readonly rule: string;
  readonly targets: readonly string[];
}

export async function findAccessibilityViolations(
  browser: WebdriverIO.Browser,
): Promise<AccessibilityViolation[]> {
  // The embedded driver cannot open the extra window that axe's default mode needs; the app has no frames anyway.
  const results = await new AxeBuilder({ client: browser }).withTags(WCAG_TAGS).setLegacyMode(true).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
}
