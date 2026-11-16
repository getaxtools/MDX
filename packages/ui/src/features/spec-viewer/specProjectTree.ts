import type {
  ChangeSummary,
  ProjectDocument,
  SpecLayoutKind,
  SpecProjectSummary,
  StructuralFinding,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import type { DocumentLocation, SpecProjectLink } from '@mdx/platform';

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
    isInitiallyExpanded: false,
    children: [],
  };
}

function projectGroups(context: TreeContext, project: SpecProjectSummary): SpecTreeNode[] {
  const label = context.translator.translate('specViewer.sidebar.dashboard');
  const groups: SpecTreeNode[] = [
    {
      id: `${context.idPrefix}|dashboard`,
      label,
      accessibleName: label,
      dashboard: { rootKey: context.root.canonicalKey, folder: project.folder },
      isInitiallyExpanded: false,
      children: [],
    },
  ];
  const add = (key: MessageKey, children: readonly SpecTreeNode[], isInitiallyExpanded = false) => {
    if (children.length > 0)
      groups.push(groupNode(context, { titleKey: key, children, isInitiallyExpanded }));
  };
  add(
    'specViewer.group.capabilities',
    project.capabilities.map((capability) => documentNode(context, capability.name, capability.path)),
  );
  add(
    'specViewer.group.changes',
    project.activeChanges.map((change) => changeNode(context, change)),
    true,
  );
  add(
    'specViewer.group.archive',
    project.archivedChanges.map((change) => changeNode(context, change)),
  );
  add(
    'specViewer.group.agentInstructions',
    project.agentInstructions.map((file) => agentFileNode(context, file, project.folder)),
  );
  add(
    'specViewer.group.linkedFolders',
    project.linkedFolders.map((link) => linkNode(context, link)),
  );
  return groups;
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
