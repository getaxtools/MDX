import { changeStatusOf, type ChangeStatus, type SpecProjectSummary } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { isViewLocation, viewLocation, type DocumentLocation } from '@mdx/platform';
import type { SpecProjectsView } from './SpecViewerActions';
import type { ScannedSpecRoot } from './specProjectTree';

export interface ShownDashboard {
  readonly scanned: ScannedSpecRoot;
  readonly project: SpecProjectSummary;
}

export interface DashboardRow {
  readonly name: string;
  readonly created: string;
  readonly tasks: string;
  readonly problems: string;
  readonly status: string;
  /** The change folder relative to the root, whose page the row opens. */
  readonly changeFolder: string;
}

const DASHBOARD_VIEW = 'spec-dashboard';

const STATUS_KEYS: Readonly<Record<ChangeStatus, MessageKey>> = {
  noTasks: 'specViewer.status.noTasks',
  notStarted: 'specViewer.status.notStarted',
  inProgress: 'specViewer.status.inProgress',
  tasksComplete: 'specViewer.status.tasksComplete',
  archived: 'specViewer.status.archived',
};

function dashboardViewKey(rootKey: string, folder: string): string {
  return `${DASHBOARD_VIEW}:${rootKey}|${folder}`;
}

/** The tab of a project's dashboard. */
export function dashboardLocationOf(
  rootKey: string,
  project: SpecProjectSummary,
  translator: Translator,
): DocumentLocation {
  const title = translator.translate('specViewer.dashboard.tabTitle', { name: project.name });
  return viewLocation(dashboardViewKey(rootKey, project.folder), title);
}

/** The project whose dashboard a tab shows, while its folder is still part of the workspace. */
export function shownDashboardOf(
  view: SpecProjectsView | undefined,
  location: DocumentLocation | undefined,
): ShownDashboard | undefined {
  if (!location || !isViewLocation(location)) return undefined;
  for (const scanned of view?.roots ?? []) {
    const project = scanned.projects.find(
      (candidate) =>
        viewLocation(dashboardViewKey(scanned.root.canonicalKey, candidate.folder), '').canonicalKey ===
        location.canonicalKey,
    );
    if (project) return { scanned, project };
  }
  return undefined;
}

function problemsText(dashboard: ShownDashboard, changeFolder: string, translator: Translator): string {
  const findings = dashboard.scanned.findingsByChange.get(changeFolder) ?? [];
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.length - errors;
  if (findings.length === 0) return translator.translate('specViewer.dashboard.noProblems');
  return translator.translate('specViewer.dashboard.problemCount', { count: errors, number: warnings });
}

/** One row per active change: its name, creation day, task completion, problem counts and status. */
export function dashboardRowsOf(dashboard: ShownDashboard, translator: Translator): DashboardRow[] {
  return dashboard.project.activeChanges.map((change) => {
    const progress = change.progress;
    return {
      name: change.name,
      created: change.created ?? '',
      tasks:
        progress && progress.total > 0
          ? translator.translate('specViewer.change.progress', {
              current: progress.done,
              total: progress.total,
            })
          : translator.translate('specViewer.dashboard.noTaskCount'),
      problems: problemsText(dashboard, change.folder, translator),
      status: translator.translate(STATUS_KEYS[changeStatusOf(change)]),
      changeFolder: change.folder,
    };
  });
}
