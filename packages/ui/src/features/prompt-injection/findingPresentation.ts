import {
  highestSeverityOf,
  Ruleset,
  safeDisplayText,
  type InjectionCheckResult,
  type InjectionFinding,
  type InjectionSeverity,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';

export type ListedSeverity = Exclude<InjectionSeverity, 'info'>;

export interface FindingGroup {
  readonly severity: ListedSeverity;
  readonly findings: readonly InjectionFinding[];
}

export interface GroupedFindings {
  /** High, then Medium, then Low; a severity without findings has no group. */
  readonly severityGroups: readonly FindingGroup[];
  /** Info findings, such as comments and front matter, listed in a collapsed group of their own. */
  readonly hiddenContent: readonly InjectionFinding[];
}

const LISTED_SEVERITIES: readonly ListedSeverity[] = ['high', 'medium', 'low'];

export function groupFindings(findings: readonly InjectionFinding[]): GroupedFindings {
  const severityGroups = LISTED_SEVERITIES.map((severity) => ({
    severity,
    findings: findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.findings.length > 0);
  return { severityGroups, hiddenContent: findings.filter((finding) => finding.severity === 'info') };
}

/** The catalog keys come from the bundled rules; a test checks that each one is in the catalog. */
function ruleKeysOf(ruleId: string): { readonly title: MessageKey; readonly explanation: MessageKey } {
  const rule = Ruleset.bundled().rule(ruleId);
  return { title: rule.titleKey as MessageKey, explanation: rule.explanationKey as MessageKey };
}

export function ruleTitleOf(finding: InjectionFinding, translator: Translator): string {
  return translator.translate(ruleKeysOf(finding.ruleId).title);
}

export function explanationOf(finding: InjectionFinding, translator: Translator): string {
  return translator.translate(ruleKeysOf(finding.ruleId).explanation, finding.messageArguments);
}

export function severityLabelOf(severity: InjectionSeverity, translator: Translator): string {
  return translator.translate(`promptInjection.severity.${severity}`);
}

/** One-based line and column, as people count them. */
export function positionLabelOf(finding: InjectionFinding, translator: Translator): string {
  return translator.translate('promptInjection.finding.position', {
    line: finding.line + 1,
    column: finding.column + 1,
  });
}

/** Decoded text can hold anything, so it gets the same markers and length limit as an excerpt. */
export function decodedTextOf(finding: InjectionFinding): string | undefined {
  return finding.decoded === undefined ? undefined : safeDisplayText(finding.decoded);
}

/** "2 findings, highest High", or the words that never call a document safe. */
export function summaryOf(result: InjectionCheckResult, translator: Translator): string {
  const highest = highestSeverityOf(result.findings.map((finding) => finding.severity));
  if (highest === undefined) return translator.translate('promptInjection.panel.nothingFound');
  return translator.translate('promptInjection.panel.summary', {
    count: result.findings.length,
    severity: severityLabelOf(highest, translator),
  });
}
