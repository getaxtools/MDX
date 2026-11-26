import type { ChangeSummary, SpecProjectSummary, StructuralFinding } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import { isViewLocation, viewLocation, type DocumentLocation } from '@mdx/platform';
import { findingMessageOf } from './findingMessages';
import type { SpecProjectsView } from './SpecViewerActions';
import type { ScannedSpecRoot } from './specProjectTree';

export interface ShownChangePage {
  readonly scanned: ScannedSpecRoot;
  readonly project: SpecProjectSummary;
  readonly change: ChangeSummary;
}

export interface FindingRow {
  readonly message: string;
  readonly severity: StructuralFinding['severity'];
  /** Where the finding is, such as `specs/tabs/spec.md, line 5`. */
  readonly place: string;
  /** The full path of its document, or undefined for a finding about the whole change. */
  readonly documentPath?: string | undefined;
  readonly line?: number | undefined;
}

const CHANGE_PAGE_VIEW = 'spec-change';

function changeViewKey(rootKey: string, changeFolder: string): string {
  return `${CHANGE_PAGE_VIEW}:${rootKey}|${changeFolder}`;
}

/** The tab of a change's page. */
export function changePageLocationOf(
  rootKey: string,
  change: ChangeSummary,
  translator: Translator,
): DocumentLocation {
  const title = translator.translate('specViewer.changePage.tabTitle', { name: change.name });
  return viewLocation(changeViewKey(rootKey, change.folder), title);
}

/** The active change whose page a tab shows, while it is still part of the workspace. */
export function shownChangePageOf(
  view: SpecProjectsView | undefined,
  location: DocumentLocation | undefined,
): ShownChangePage | undefined {
  if (!location || !isViewLocation(location)) return undefined;
  for (const scanned of view?.roots ?? []) {
    for (const project of scanned.projects) {
      const change = project.activeChanges.find(
        (candidate) =>
          viewLocation(changeViewKey(scanned.root.canonicalKey, candidate.folder), '').canonicalKey ===
          location.canonicalKey,
      );
      if (change) return { scanned, project, change };
    }
  }
  return undefined;
}

export function fullPathOf(root: DocumentLocation, relativePath: string): string {
  const separator = root.displayPath.includes('\\') ? '\\' : '/';
  const base = root.displayPath.endsWith(separator) ? root.displayPath.slice(0, -1) : root.displayPath;
  return `${base}${separator}${relativePath.split('/').join(separator)}`;
}

function placeOf(finding: StructuralFinding, translator: Translator): string {
  if (finding.path === '') return translator.translate('specViewer.problems.wholeChange');
  if (finding.line === undefined) return finding.path;
  return translator.translate('specViewer.problems.place', { path: finding.path, number: finding.line });
}

function severityRank(finding: StructuralFinding): number {
  return finding.severity === 'error' ? 0 : 1;
}

/** The findings of a change as the problems list shows them, errors first. */
export function findingRowsOf(page: ShownChangePage, translator: Translator): FindingRow[] {
  const findings = page.scanned.findingsByChange.get(page.change.folder) ?? [];
  return [...findings]
    .sort((first, second) => severityRank(first) - severityRank(second))
    .map((finding) => ({
      message: findingMessageOf(finding, translator),
      severity: finding.severity,
      place: placeOf(finding, translator),
      documentPath:
        finding.path === ''
          ? undefined
          : fullPathOf(page.scanned.root, `${page.change.folder}/${finding.path}`),
      line: finding.line,
    }));
}
