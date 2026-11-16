import type { InjectionSeverity } from './injectionSeverity';

export type DocumentOrigin = 'local' | 'remote' | 'untitled';
export type CheckTrigger = 'manual' | 'automatic';

export interface InjectionCheckRequest {
  readonly text: string;
  readonly origin: DocumentOrigin;
  /** Canonical path or canonical URL: it decides agent-file recognition and keys the ignore list. */
  readonly location?: string;
  /** Set by callers that know the document is read by agents, such as every file of a spec project. */
  readonly isAgentContext?: boolean;
  readonly trigger: CheckTrigger;
}

export type FindingMessageArguments = Readonly<Record<string, string | number>>;

export interface InjectionFinding {
  readonly ruleId: string;
  readonly severity: InjectionSeverity;
  /** UTF-16 offsets in the request text, never inside a surrogate pair. */
  readonly from: number;
  readonly to: number;
  /** Zero-based; the column counts UTF-16 code units from the start of the line. */
  readonly line: number;
  readonly column: number;
  /** At most 120 characters, with invisible and direction characters already replaced by markers. */
  readonly excerpt: string;
  /** The readable text behind tag characters, variation selectors or encoded data. */
  readonly decoded?: string;
  readonly messageArguments: FindingMessageArguments;
}

export interface InjectionCheckResult {
  readonly rulesetVersion: string;
  readonly findings: readonly InjectionFinding[];
  readonly isAgentFile: boolean;
  readonly ignoredCount: number;
  /** A size or count cap was hit, so some of the document was not checked or not listed. */
  readonly isPartial: boolean;
}
