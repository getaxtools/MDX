import { validEntries } from '../session/savedValues';
import type { InjectionFinding } from './InjectionCheck';
import { isIgnoredBy, type IgnoreContext, type IgnoreEntry, type IgnoreScope } from './ignoreFindings';

/** Older entries are dropped beyond this, so a saved list stays small. */
export const MAX_IGNORE_ENTRIES = 5_000;
const MAX_DOCUMENT_KEY_LENGTH = 4_096;
const RULE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const EVIDENCE_HASH = /^[0-9a-f]{16}$/;

function isDocumentKey(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.length <= MAX_DOCUMENT_KEY_LENGTH;
}

/** One finding has the hash of its matched text; a whole rule in one document has none. */
function scopeWithEvidence(
  scope: unknown,
  evidenceHash: unknown,
): { readonly scope: IgnoreScope; readonly evidenceHash: string } | undefined {
  if (scope === 'finding' && typeof evidenceHash === 'string' && EVIDENCE_HASH.test(evidenceHash))
    return { scope, evidenceHash };
  if (scope === 'ruleInDocument' && evidenceHash === '') return { scope, evidenceHash };
  return undefined;
}

function parseEntry(saved: Record<string, unknown>): IgnoreEntry | undefined {
  const { ruleId, documentKey, createdAt } = saved;
  if (typeof ruleId !== 'string' || !RULE_ID.test(ruleId) || !isDocumentKey(documentKey)) return undefined;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return undefined;
  const evidence = scopeWithEvidence(saved.scope, saved.evidenceHash);
  return evidence ? { ruleId, documentKey, ...evidence, createdAt } : undefined;
}

function isSameEntry(left: IgnoreEntry, right: IgnoreEntry): boolean {
  return (
    left.ruleId === right.ruleId &&
    left.documentKey === right.documentKey &&
    left.scope === right.scope &&
    left.evidenceHash === right.evidenceHash
  );
}

/**
 * The findings the user chose to ignore, app-wide and keyed by canonical path or URL. It holds rule
 * ids and hashes only, never document text, and is never read from a workspace file.
 */
export class InjectionIgnoreList {
  private static readonly emptyList = new InjectionIgnoreList([]);

  private constructor(private readonly ignoreEntries: readonly IgnoreEntry[]) {}

  static empty(): InjectionIgnoreList {
    return InjectionIgnoreList.emptyList;
  }

  /** Reads saved entries one by one, dropping any that do not parse. */
  static fromSaved(saved: unknown): InjectionIgnoreList {
    const entries = Array.isArray(saved) ? validEntries(saved.slice(-MAX_IGNORE_ENTRIES), parseEntry) : [];
    return entries.length === 0 ? InjectionIgnoreList.empty() : new InjectionIgnoreList(entries);
  }

  entries(): readonly IgnoreEntry[] {
    return this.ignoreEntries;
  }

  isEmpty(): boolean {
    return this.ignoreEntries.length === 0;
  }

  add(entry: IgnoreEntry): InjectionIgnoreList {
    if (this.ignoreEntries.some((existing) => isSameEntry(existing, entry))) return this;
    return new InjectionIgnoreList([...this.ignoreEntries, entry].slice(-MAX_IGNORE_ENTRIES));
  }

  /** Shows a finding again: removes every entry that hides it, for that one finding or its whole rule. */
  withoutEntriesHiding(finding: InjectionFinding, context: IgnoreContext): InjectionIgnoreList {
    const kept = this.ignoreEntries.filter((entry) => !isIgnoredBy(entry, finding, context));
    return kept.length === this.ignoreEntries.length ? this : new InjectionIgnoreList(kept);
  }

  /** What is saved, and what a move into a workspace's own state takes over unchanged. */
  toSaved(): readonly IgnoreEntry[] {
    return this.ignoreEntries;
  }
}
