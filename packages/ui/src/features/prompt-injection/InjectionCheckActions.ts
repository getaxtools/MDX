import {
  filterIgnoredFindings,
  ignoreEntryFor,
  isSidebarViewShown,
  Ruleset,
  type DocumentOrigin,
  type FilteredResult,
  type IgnoreScope,
  type InjectionCheckResult,
  type InjectionFinding,
  type InjectionIgnoreList,
  type ViewerSession,
} from '@mdx/core';
import type { EditorTextRange } from '@mdx/editor';
import { isUntitledLocation, type OpenedDocument } from '@mdx/platform';
import { isCheckedForCharactersOnly } from './checkInjectionText';
import { findingEnd } from './findingEnd';
import type { InjectionChecker } from './InjectionChecker';
import { shouldCheckAutomatically } from './shouldCheckAutomatically';

/** How long typing pauses, with the findings panel open, before the document is checked again. */
export const RECHECK_DELAY_MS = 500;

export type InjectionCheckStatus = 'checking' | 'checked' | 'failed';

/** The check of the shown document, as the findings panel and the status bar badge show it. */
export interface InjectionCheckView {
  readonly documentKey: string;
  readonly status: InjectionCheckStatus;
  /** The last finished result without ignored findings; kept while the document is checked again. */
  readonly result?: InjectionCheckResult;
  readonly ignoredFindings: readonly InjectionFinding[];
  /** The document was too large for more than the character rules. */
  readonly isCharactersOnly: boolean;
  /** The listed findings by line and column, for the editor to underline. */
  readonly findingRanges: readonly EditorTextRange[];
  /** Set only the first time a document's check finds High findings, for one polite announcement. */
  readonly isFirstHighResult?: boolean;
}

/** A finding's place, by offsets for the source view and by lines and columns for the editor. */
export interface FindingPlace {
  readonly documentKey: string;
  readonly from: number;
  readonly to: number;
  readonly range: EditorTextRange;
}

export interface InjectionCheckDependencies {
  readonly session: ViewerSession;
  readonly checker: InjectionChecker;
  /** Runs once the shown document has been drawn, so a check never delays it. */
  readonly afterPaint: (run: () => void) => void;
  readonly now: () => number;
  readonly onChange: () => void;
  /** Documents agents read as context, such as the files of a spec project, which the default setting checks. */
  readonly isAgentContext?: (opened: OpenedDocument) => boolean;
}

interface ShownDocument {
  readonly documentKey: string;
  readonly opened: OpenedDocument;
  readonly origin: DocumentOrigin;
  readonly location?: string;
  readonly isAgentContext: boolean;
  /** The text shown or edited now, which the next check reads. */
  readonly text: string;
}

interface CheckedText {
  readonly text: string;
  readonly result: InjectionCheckResult;
}

interface DocumentCheck {
  readonly documentKey: string;
  readonly status: InjectionCheckStatus;
  /** The last finished check, whose offsets and ignore hashes refer to the text it read. */
  readonly checked?: CheckedText;
}

interface FilteredCheck {
  readonly check: DocumentCheck;
  readonly ignoreList: InjectionIgnoreList;
  readonly filtered: FilteredResult | undefined;
  readonly findingRanges: readonly EditorTextRange[];
}

function rangeOf(text: string, finding: InjectionFinding): EditorTextRange {
  return { from: { line: finding.line, column: finding.column }, to: findingEnd(text, finding) };
}

function shownDocumentOf(opened: OpenedDocument, text: string, isAgentContext: boolean): ShownDocument {
  const isUntitled = isUntitledLocation(opened.location);
  return {
    documentKey: opened.location.canonicalKey,
    opened,
    origin: isUntitled ? 'untitled' : 'local',
    ...(isUntitled ? {} : { location: opened.location.displayPath }),
    isAgentContext: !isUntitled && isAgentContext,
    text,
  };
}

/** Checks the shown document on request, and again after edits, saves and changes on disk while the panel is open. */
export class InjectionCheckActions {
  private shown: ShownDocument | undefined;
  private current: DocumentCheck | undefined;
  private pendingRecheck: ReturnType<typeof setTimeout> | undefined;
  private lastFiltered: FilteredCheck | undefined;
  /** Documents whose High findings were announced once already in this session. */
  private readonly announcedDocumentKeys = new Set<string>();
  private announcedCheck: DocumentCheck | undefined;

  constructor(private readonly dependencies: InjectionCheckDependencies) {}

  /** The active document after it was drawn: another document, or the same one saved or reloaded. */
  documentShown(opened: OpenedDocument | undefined, text: string | undefined): void {
    if (!opened || text === undefined) {
      this.forget();
      return;
    }
    const isSameDocument = this.shown?.documentKey === opened.location.canonicalKey;
    if (isSameDocument && this.shown?.opened === opened) return;
    this.shown = shownDocumentOf(opened, text, this.isAgentContext(opened));
    if (!isSameDocument) this.forgetCheck();
    if (this.isCheckedWhenShown()) this.checkAfterPaint();
  }

  /** Typing changed the text; with the panel open, it is checked again once typing stops. */
  textEdited(documentKey: string, text: string): void {
    if (this.shown?.documentKey !== documentKey) return;
    this.shown = { ...this.shown, text };
    if (!this.isPanelShown()) return;
    clearTimeout(this.pendingRecheck);
    this.pendingRecheck = setTimeout(() => void this.checkShownDocument(), RECHECK_DELAY_MS);
  }

  /** The panel was opened or the setting changed: a document they now cover is checked if it was not yet. */
  viewChanged(): void {
    if (!this.shown || !this.isCheckedWhenShown()) return;
    if (this.current?.documentKey !== this.shown.documentKey) void this.checkShownDocument();
  }

  async checkShownDocument(): Promise<void> {
    clearTimeout(this.pendingRecheck);
    this.pendingRecheck = undefined;
    const shown = this.shown;
    if (!shown) return;
    const previous = this.current?.documentKey === shown.documentKey ? this.current.checked : undefined;
    const check: DocumentCheck = {
      documentKey: shown.documentKey,
      status: 'checking',
      ...(previous ? { checked: previous } : {}),
    };
    this.current = check;
    this.dependencies.onChange();
    this.finishCheck(check, { text: shown.text, outcome: await this.runCheck(shown) });
  }

  ignore(finding: InjectionFinding, scope: IgnoreScope): void {
    const check = this.current;
    if (!check?.checked) return;
    const entry = ignoreEntryFor(finding, scope, {
      text: check.checked.text,
      documentKey: check.documentKey,
      now: this.dependencies.now,
    });
    this.dependencies.session.updateInjectionIgnoreList((list) => list.add(entry));
  }

  showAgain(finding: InjectionFinding): void {
    const check = this.current;
    if (!check?.checked) return;
    const context = { text: check.checked.text, documentKey: check.documentKey, ruleset: Ruleset.bundled() };
    this.dependencies.session.updateInjectionIgnoreList((list) =>
      list.withoutEntriesHiding(finding, context),
    );
  }

  /** Where a finding of the last check is, or undefined once its document is no longer shown. */
  placeOf(finding: InjectionFinding): FindingPlace | undefined {
    const check = this.current;
    if (!check?.checked || check.documentKey !== this.shown?.documentKey) return undefined;
    return {
      documentKey: check.documentKey,
      from: finding.from,
      to: finding.to,
      range: rangeOf(check.checked.text, finding),
    };
  }

  view(): InjectionCheckView | undefined {
    const check = this.current;
    if (!check) return undefined;
    const { filtered, findingRanges } = this.filteredCheckOf(check);
    return {
      documentKey: check.documentKey,
      status: check.status,
      ...(filtered ? { result: filtered.result } : {}),
      ignoredFindings: filtered?.ignoredFindings ?? [],
      isCharactersOnly: check.checked ? isCheckedForCharactersOnly(check.checked.text) : false,
      findingRanges,
      ...(this.announcedCheck === check ? { isFirstHighResult: true } : {}),
    };
  }

  stop(): void {
    this.forget();
  }

  private isAgentContext(opened: OpenedDocument): boolean {
    return this.dependencies.isAgentContext?.(opened) ?? false;
  }

  /** An open panel checks each document it is shown with; the setting decides for the others. */
  private isCheckedWhenShown(): boolean {
    const shown = this.shown;
    if (!shown) return false;
    const setting = this.dependencies.session.currentState().viewSettings.automaticInjectionCheck;
    return this.isPanelShown() || shouldCheckAutomatically(shown, setting);
  }

  private isPanelShown(): boolean {
    return isSidebarViewShown(this.dependencies.session.currentState().viewSettings, 'promptInjection');
  }

  private checkAfterPaint(): void {
    const documentKey = this.shown?.documentKey;
    this.dependencies.afterPaint(() => {
      if (this.shown?.documentKey === documentKey && this.isCheckedWhenShown())
        void this.checkShownDocument();
    });
  }

  private async runCheck(shown: ShownDocument): Promise<InjectionCheckResult | 'failed' | undefined> {
    try {
      return await this.dependencies.checker.checkDocument({
        text: shown.text,
        origin: shown.origin,
        ...(shown.location === undefined ? {} : { location: shown.location }),
        ...(shown.isAgentContext ? { isAgentContext: true } : {}),
        trigger: 'manual',
      });
    } catch {
      return 'failed';
    }
  }

  private finishCheck(
    check: DocumentCheck,
    {
      text,
      outcome,
    }: { readonly text: string; readonly outcome: InjectionCheckResult | 'failed' | undefined },
  ): void {
    if (outcome === undefined || this.current !== check) return;
    this.current =
      outcome === 'failed'
        ? { documentKey: check.documentKey, status: 'failed' }
        : { documentKey: check.documentKey, status: 'checked', checked: { text, result: outcome } };
    this.rememberFirstHighResult(this.current);
    this.dependencies.onChange();
  }

  private rememberFirstHighResult(check: DocumentCheck): void {
    const hasHigh = this.filteredCheckOf(check).filtered?.result.findings.some(
      (finding) => finding.severity === 'high',
    );
    if (!hasHigh || this.announcedDocumentKeys.has(check.documentKey)) return;
    this.announcedDocumentKeys.add(check.documentKey);
    this.announcedCheck = check;
  }

  private filteredCheckOf(check: DocumentCheck): FilteredCheck {
    const ignoreList = this.dependencies.session.currentState().injectionIgnoreList;
    const cached = this.lastFiltered;
    if (cached?.check === check && cached.ignoreList === ignoreList) return cached;
    const filtered = check.checked
      ? filterIgnoredFindings(check.checked.result, ignoreList.entries(), {
          text: check.checked.text,
          documentKey: check.documentKey,
          ruleset: Ruleset.bundled(),
        })
      : undefined;
    const checkedText = check.checked?.text ?? '';
    const findingRanges = (filtered?.result.findings ?? []).map((finding) => rangeOf(checkedText, finding));
    this.lastFiltered = { check, ignoreList, filtered, findingRanges };
    return this.lastFiltered;
  }

  private forget(): void {
    this.shown = undefined;
    this.forgetCheck();
  }

  private forgetCheck(): void {
    clearTimeout(this.pendingRecheck);
    this.pendingRecheck = undefined;
    this.dependencies.checker.cancel();
    this.current = undefined;
  }
}
