import type {
  ChangeSummary,
  DecisionRecordSummary,
  FeatureSummary,
  FolderSpecSummary,
  ProjectDocument,
  SpecLayoutKind,
  SpecProjectSummary,
  StructuralFinding,
  TaskProgress,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import type { DocumentLocation, SpecProjectLink } from '@mdx/platform';
import { featureDocumentEntries } from './featureDocumentList';

/** The spec projects found in one folder of the workspace. */
export interface ScannedSpecRoot {
  readonly root: DocumentLocation;
  readonly isIncomplete: boolean;
  readonly projects: readonly SpecProjectSummary[];
  /** The structural findings of each active change, by its folder relative to the root. */
  readonly findingsByChange: ReadonlyMap<string, readonly StructuralFinding[]>;
}

export interface SpecTreeNode {
  /** Stable across scans, so a folded or unfolded row stays so. */
  readonly id: string;
  readonly label: string;
  readonly accessibleName: string;
  /** A short second text, such as a format, a task count or a date. */
  readonly detail?: string | undefined;
  /** The full path of the document the row opens. */
  readonly documentPath?: string | undefined;
  readonly isUnavailable?: boolean | undefined;
  /** The project whose dashboard the row opens. */
  readonly dashboard?: { readonly rootKey: string; readonly folder: string } | undefined;
  /** A linked folder not followed yet, which the row offers to follow. */
  readonly linkToFollow?: { readonly rootKey: string; readonly linkPath: string } | undefined;
  /** The feature whose page the row opens. */
  readonly featurePage?: { readonly rootKey: string; readonly featureFolder: string } | undefined;
  /** The active change whose page the row opens. */
  readonly changePage?: { readonly rootKey: string; readonly changeFolder: string } | undefined;
  readonly isInitiallyExpanded: boolean;
  readonly children: readonly SpecTreeNode[];
}

const FORMAT_KEYS: Readonly<Record<SpecLayoutKind, MessageKey>> = {
  changeBased: 'specViewer.format.changeBased',
  featureNumbered: 'specViewer.format.featureNumbered',
  requirementsDesignTasks: 'specViewer.format.requirementsDesignTasks',
  decisionRecords: 'specViewer.format.decisionRecords',
};

interface TreeContext {
  readonly translator: Translator;
  readonly root: DocumentLocation;
  readonly idPrefix: string;
}

function fullPathOf(root: DocumentLocation, relativePath: string): string {
  const separator = root.displayPath.includes('\\') ? '\\' : '/';
  const base = root.displayPath.endsWith(separator) ? root.displayPath.slice(0, -1) : root.displayPath;
  return `${base}${separator}${relativePath.split('/').join(separator)}`;
}

function documentNode(context: TreeContext, label: string, path: string): SpecTreeNode {
  return {
    id: `${context.idPrefix}|${path}`,
    label,
    accessibleName: label,
    documentPath: fullPathOf(context.root, path),
    isInitiallyExpanded: false,
    children: [],
  };
}

interface GroupContents {
  readonly titleKey: MessageKey;
  readonly children: readonly SpecTreeNode[];
  readonly isInitiallyExpanded: boolean;
}

function groupNode(
  context: TreeContext,
  { titleKey, children, isInitiallyExpanded }: GroupContents,
): SpecTreeNode {
  const title = context.translator.translate(titleKey);
  return {
    id: `${context.idPrefix}|${titleKey}`,
    label: title,
    accessibleName: context.translator.translate('specViewer.group.count', {
      name: title,
      count: children.length,
    }),
    detail: String(children.length),
    isInitiallyExpanded,
    children,
  };
}

function changeDocumentNodes(context: TreeContext, change: ChangeSummary): SpecTreeNode[] {
  const { translator } = context;
  const { proposal, design, tasks, deltas } = change.documents;
  const named = (key: MessageKey, path: string | undefined) =>
    path === undefined ? [] : [documentNode(context, translator.translate(key), path)];
  return [
    ...named('specViewer.document.proposal', proposal),
    ...named('specViewer.document.design', design),
    ...named('specViewer.document.tasks', tasks),
    ...deltas.map((delta) =>
      documentNode(
        context,
        translator.translate('specViewer.document.delta', { name: delta.name }),
        delta.path,
      ),
    ),
  ];
}

function changeAccessibleName(translator: Translator, change: ChangeSummary): string {
  const { name, progress, archivedOn } = change;
  if (progress)
    return translator.translate('specViewer.change.progressName', {
      name,
      current: progress.done,
      total: progress.total,
    });
  if (archivedOn !== undefined)
    return translator.translate('specViewer.change.archivedName', { name, date: archivedOn });
  return name;
}

function changeNode(context: TreeContext, change: ChangeSummary): SpecTreeNode {
  const { progress } = change;
  const progressText =
    progress &&
    context.translator.translate('specViewer.change.progress', {
      current: progress.done,
      total: progress.total,
    });
  return {
    id: `${context.idPrefix}|${change.folder}`,
    label: change.name,
    accessibleName: changeAccessibleName(context.translator, change),
    detail: progressText ?? change.archivedOn,
    changePage:
      change.archivedOn === undefined
        ? { rootKey: context.root.canonicalKey, changeFolder: change.folder }
        : undefined,
    isInitiallyExpanded: false,
    children: changeDocumentNodes(context, change),
  };
}

function agentFileNode(context: TreeContext, file: ProjectDocument, projectFolder: string): SpecTreeNode {
  const inProject = projectFolder === '' ? file.path : file.path.slice(projectFolder.length + 1);
  const folder = inProject.split('/').slice(0, -1).join('/');
  const node = documentNode(context, file.name, file.path);
  if (folder === '') return node;
  const accessibleName = context.translator.translate('specViewer.agentFile.inFolder', {
    name: file.name,
    folder,
  });
  return { ...node, accessibleName, detail: folder };
}

function linkNode(context: TreeContext, link: SpecProjectLink): SpecTreeNode {
  const key = link.isFollowed ? 'specViewer.link.followed' : 'specViewer.link.notFollowed';
  return {
    id: `${context.idPrefix}|link|${link.path}`,
    label: link.path,
    accessibleName: context.translator.translate(key, { path: link.path }),
    isUnavailable: !link.isFollowed,
    linkToFollow: link.isFollowed ? undefined : { rootKey: context.root.canonicalKey, linkPath: link.path },
    isInitiallyExpanded: false,
    children: [],
  };
}

/** The name with the task count the row shows, so what is read out starts with what is seen. */
function withProgressName(translator: Translator, name: string, progress: TaskProgress | undefined): string {
  return progress
    ? translator.translate('specViewer.change.progressName', {
        name,
        current: progress.done,
        total: progress.total,
      })
    : name;
}

function featureNode(context: TreeContext, feature: FeatureSummary): SpecTreeNode {
  const { translator } = context;
  const progress = feature.progress;
  const progressText =
    progress &&
    translator.translate('specViewer.change.progress', { current: progress.done, total: progress.total });
  const currentText = feature.isCurrent ? translator.translate('specViewer.feature.currentBadge') : undefined;
  const documents = featureDocumentEntries(feature.documents, translator).flatMap((entry) =>
    entry.path === undefined ? [] : [documentNode(context, entry.label, entry.path)],
  );
  return {
    id: `${context.idPrefix}|${feature.folder}`,
    label: feature.name,
    accessibleName: withProgressName(
      translator,
      feature.isCurrent
        ? translator.translate('specViewer.feature.current', { name: feature.name })
        : feature.name,
      progress,
    ),
    detail: [currentText, progressText].filter(Boolean).join(' - ') || undefined,
    featurePage: { rootKey: context.root.canonicalKey, featureFolder: feature.folder },
    isInitiallyExpanded: false,
    children: documents,
  };
}

function folderSpecNode(context: TreeContext, spec: FolderSpecSummary): SpecTreeNode {
  const { translator } = context;
  const named = (key: MessageKey, path: string | undefined) =>
    path === undefined ? [] : [documentNode(context, translator.translate(key), path)];
  const progress = spec.progress;
  return {
    id: `${context.idPrefix}|${spec.folder}`,
    label: spec.name,
    accessibleName: spec.isBugfix
      ? translator.translate('specViewer.folderSpec.bugfixName', {
          name: withProgressName(translator, spec.name, progress),
        })
      : withProgressName(translator, spec.name, progress),
    detail:
      progress &&
      translator.translate('specViewer.change.progress', { current: progress.done, total: progress.total }),
    isInitiallyExpanded: false,
    children: [
      ...named(
        spec.isBugfix ? 'specViewer.document.bugfix' : 'specViewer.document.requirements',
        spec.requirements,
      ),
      ...named('specViewer.document.design', spec.design),
      ...named('specViewer.document.tasks', spec.tasks),
    ],
  };
}

function decisionRecordNode(context: TreeContext, record: DecisionRecordSummary): SpecTreeNode {
  const label = `${record.number} ${record.title ?? record.path.split('/').at(-1) ?? ''}`;
  const node = documentNode(context, label, record.path);
  return record.status === undefined
    ? node
    : { ...node, detail: record.status, accessibleName: `${label}, ${record.status}` };
}

function featureNumberedNodes(context: TreeContext, project: SpecProjectSummary): SpecTreeNode[] {
  const constitution = project.constitution;
  if (constitution === undefined) return [];
  return [
    documentNode(context, context.translator.translate('specViewer.sidebar.constitution'), constitution),
  ];
}

interface GroupSpec {
  readonly titleKey: MessageKey;
  readonly children: readonly SpecTreeNode[];
  readonly isInitiallyExpanded?: boolean;
}

function layoutGroupSpecsOf(context: TreeContext, project: SpecProjectSummary): GroupSpec[] {
  return [
    {
      titleKey: 'specViewer.group.features',
      children: project.features.map((feature) => featureNode(context, feature)),
      isInitiallyExpanded: true,
    },
    {
      titleKey: 'specViewer.group.reports',
      children: project.reports.map((report) => documentNode(context, report.name, report.path)),
    },
    {
      titleKey: 'specViewer.group.folderSpecs',
      children: project.folderSpecs.map((spec) => folderSpecNode(context, spec)),
      isInitiallyExpanded: true,
    },
    {
      titleKey: 'specViewer.group.decisionRecords',
      children: project.decisionRecords.map((record) => decisionRecordNode(context, record)),
    },
  ];
}

function changeAndOtherGroupSpecsOf(context: TreeContext, project: SpecProjectSummary): GroupSpec[] {
  return [
    {
      titleKey: 'specViewer.group.capabilities',
      children: project.capabilities.map((capability) =>
        documentNode(context, capability.name, capability.path),
      ),
    },
    {
      titleKey: 'specViewer.group.changes',
      children: project.activeChanges.map((change) => changeNode(context, change)),
      isInitiallyExpanded: true,
    },
    {
      titleKey: 'specViewer.group.archive',
      children: project.archivedChanges.map((change) => changeNode(context, change)),
    },
    {
      titleKey: 'specViewer.group.agentInstructions',
      children: project.agentInstructions.map((file) => agentFileNode(context, file, project.folder)),
    },
    {
      titleKey: 'specViewer.group.linkedFolders',
      children: project.linkedFolders.map((link) => linkNode(context, link)),
    },
  ];
}

function groupSpecsOf(context: TreeContext, project: SpecProjectSummary): GroupSpec[] {
  return [...layoutGroupSpecsOf(context, project), ...changeAndOtherGroupSpecsOf(context, project)];
}

function projectGroups(context: TreeContext, project: SpecProjectSummary): SpecTreeNode[] {
  const label = context.translator.translate('specViewer.sidebar.dashboard');
  const dashboard: SpecTreeNode = {
    id: `${context.idPrefix}|dashboard`,
    label,
    accessibleName: label,
    dashboard: { rootKey: context.root.canonicalKey, folder: project.folder },
    isInitiallyExpanded: false,
    children: [],
  };
  const groups = groupSpecsOf(context, project)
    .filter((group) => group.children.length > 0)
    .map((group) =>
      groupNode(context, {
        titleKey: group.titleKey,
        children: group.children,
        isInitiallyExpanded: group.isInitiallyExpanded ?? false,
      }),
    );
  return [dashboard, ...featureNumberedNodes(context, project), ...groups];
}

function projectNode(
  translator: Translator,
  scanned: ScannedSpecRoot,
  project: SpecProjectSummary,
): SpecTreeNode {
  const idPrefix = `${scanned.root.canonicalKey}|${project.folder}`;
  const formats = project.layouts.map((layout) => translator.translate(FORMAT_KEYS[layout])).join(', ');
  return {
    id: idPrefix,
    label: project.name,
    accessibleName: formats === '' ? project.name : `${project.name}, ${formats}`,
    detail: formats === '' ? undefined : formats,
    isInitiallyExpanded: true,
    children: projectGroups({ translator, root: scanned.root, idPrefix }, project),
  };
}

/** The rows of the Spec viewer's sidebar: one per project, then its groups, then their documents. */
export function specProjectTree(roots: readonly ScannedSpecRoot[], translator: Translator): SpecTreeNode[] {
  return roots.flatMap((scanned) =>
    scanned.projects.map((project) => projectNode(translator, scanned, project)),
  );
}
