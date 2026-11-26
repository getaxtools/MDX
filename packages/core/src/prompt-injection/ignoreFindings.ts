import type { InjectionCheckResult, InjectionFinding } from './InjectionCheck';
import type { Ruleset } from './Ruleset';

export type IgnoreScope = 'finding' | 'ruleInDocument';

/** What the ignore list stores: hashes and ids, never document text. */
export interface IgnoreEntry {
  readonly ruleId: string;
  /** Canonical path or canonical URL of the document. */
  readonly documentKey: string;
  /** FNV-1a 64-bit hash of the rule id and the matched text; empty for a whole rule in one document. */
  readonly evidenceHash: string;
  readonly scope: IgnoreScope;
  readonly createdAt: number;
}

export interface IgnoreContext {
  readonly text: string;
  readonly documentKey: string;
  readonly ruleset: Ruleset;
}

export interface FilteredResult {
  readonly result: InjectionCheckResult;
  /** Kept so the panel can show them on request: ignored findings are counted, never silently gone. */
  readonly ignoredFindings: readonly InjectionFinding[];
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const SIXTY_FOUR_BITS = 0xffffffffffffffffn;
const HEXADECIMAL = 16;
const HASH_DIGITS = 16;
const SEPARATOR = '\u{0}';

/** FNV-1a over the UTF-8 bytes of the rule id and the evidence, so a changed payload gets a new hash. */
export function evidenceHashOf(ruleId: string, evidence: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(`${ruleId}${SEPARATOR}${evidence}`)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & SIXTY_FOUR_BITS;
  }
  return hash.toString(HEXADECIMAL).padStart(HASH_DIGITS, '0');
}

export function ignoreEntryFor(
  finding: InjectionFinding,
  scope: IgnoreScope,
  {
    text,
    documentKey,
    now,
  }: { readonly text: string; readonly documentKey: string; readonly now: () => number },
): IgnoreEntry {
  const evidenceHash =
    scope === 'finding' ? evidenceHashOf(finding.ruleId, text.slice(finding.from, finding.to)) : '';
  return { ruleId: finding.ruleId, documentKey, evidenceHash, scope, createdAt: now() };
}

/** Same document and rule, the rule's earlier names included, and for one finding the same matched text. */
export function isIgnoredBy(entry: IgnoreEntry, finding: InjectionFinding, context: IgnoreContext): boolean {
  if (entry.documentKey !== context.documentKey) return false;
  if (context.ruleset.currentRuleIdOf(entry.ruleId) !== finding.ruleId) return false;
  if (entry.scope === 'ruleInDocument') return true;
  return entry.evidenceHash === evidenceHashOf(entry.ruleId, context.text.slice(finding.from, finding.to));
}

/** Leaves out the findings the user ignored in this document, and counts them. */
export function filterIgnoredFindings(
  result: InjectionCheckResult,
  entries: readonly IgnoreEntry[],
  context: IgnoreContext,
): FilteredResult {
  const documentEntries = entries.filter((entry) => entry.documentKey === context.documentKey);
  if (documentEntries.length === 0) return { result, ignoredFindings: [] };
  const isIgnored = (finding: InjectionFinding) =>
    documentEntries.some((entry) => isIgnoredBy(entry, finding, context));
  const ignoredFindings = result.findings.filter(isIgnored);
  return {
    result: {
      ...result,
      findings: result.findings.filter((finding) => !isIgnored(finding)),
      ignoredCount: ignoredFindings.length,
    },
    ignoredFindings,
  };
}
