import type { SpecProjectManifest } from '@mdx/platform';
import { topLevelYamlValue } from '../yaml/readTopLevelYamlEntries';
import { keyOf, ProjectFiles, uniqueInAnyCase } from './ProjectFiles';

export type SpecLayoutKind =
  'changeBased' | 'featureNumbered' | 'requirementsDesignTasks' | 'decisionRecords';

/** Folders and files below are relative to the project folder, with `/` between parts. */
export interface ChangeBasedLayout {
  readonly kind: 'changeBased';
  readonly folder: string;
  /** Named when the configuration points to a separate planning store and no specs are here. */
  readonly planningStore?: string;
}

export interface FeatureFolder {
  /** The folder name, which is also the feature's branch name. */
  readonly name: string;
  readonly folder: string;
  readonly number?: number;
  /** `YYYYMMDD-HHMMSS` for features named by time instead of by number. */
  readonly timestamp?: string;
}

export interface FeatureNumberedLayout {
  readonly kind: 'featureNumbered';
  readonly folder: string;
  readonly features: readonly FeatureFolder[];
}

export interface FeatureSpecFolder {
  readonly name: string;
  readonly folder: string;
}

export interface RequirementsDesignTasksLayout {
  readonly kind: 'requirementsDesignTasks';
  readonly folder: string;
  readonly specs: readonly FeatureSpecFolder[];
}

export interface DecisionRecordFile {
  /** The number prefix as written, such as `0003`. */
  readonly number: string;
  readonly path: string;
}

export interface DecisionRecordsLayout {
  readonly kind: 'decisionRecords';
  readonly records: readonly DecisionRecordFile[];
}

export type SpecLayout =
  ChangeBasedLayout | FeatureNumberedLayout | RequirementsDesignTasksLayout | DecisionRecordsLayout;

export interface DetectedSpecProject {
  /** The project folder relative to the scanned root; empty for the root itself. */
  readonly folder: string;
  readonly name: string;
  readonly layouts: readonly SpecLayout[];
}

const CHANGE_BASED_FOLDER = 'openspec';
const FEATURE_MARKER_FOLDER = '.specify';
const FEATURES_FOLDER = 'specs';
const REQUIREMENTS_DESIGN_TASKS_FOLDER = '.kiro/specs';
const DECISION_RECORD_FOLDERS = ['docs/decisions', 'docs/adr', 'doc/adr', 'adr'] as const;
const CONFIGURATION_FILES = ['config.yaml', 'config.yml'] as const;
const TIMESTAMPED_FEATURE = /^(\d{8}-\d{6})-./;
const NUMBERED_FEATURE = /^(\d{3,})-./;
const DECISION_RECORD = /^(\d+)-.*\.(?:md|markdown)$/i;

function changeBasedLayoutOf(view: ProjectFiles): ChangeBasedLayout | undefined {
  const configuration = CONFIGURATION_FILES.map((name) => `${CHANGE_BASED_FOLDER}/${name}`).find((path) =>
    view.hasFile(path),
  );
  const hasPlanningFolders =
    view.hasFolder(`${CHANGE_BASED_FOLDER}/specs`) || view.hasFolder(`${CHANGE_BASED_FOLDER}/changes`);
  if (configuration === undefined && !hasPlanningFolders) return undefined;
  const store =
    configuration === undefined ? undefined : topLevelYamlValue(view.textOf(configuration) ?? '', 'store');
  const isStoreOnly = !hasPlanningFolders && store !== undefined && store !== '';
  return isStoreOnly
    ? { kind: 'changeBased', folder: CHANGE_BASED_FOLDER, planningStore: store }
    : { kind: 'changeBased', folder: CHANGE_BASED_FOLDER };
}

function featureFolderOf(name: string): FeatureFolder | undefined {
  const folder = `${FEATURES_FOLDER}/${name}`;
  const timestamp = TIMESTAMPED_FEATURE.exec(name)?.[1];
  if (timestamp !== undefined) return { name, folder, timestamp };
  const number = NUMBERED_FEATURE.exec(name)?.[1];
  return number === undefined ? undefined : { name, folder, number: Number(number) };
}

/** Numbered features first by number, then features named by time in time order. */
function compareFeatures(first: FeatureFolder, second: FeatureFolder): number {
  if (first.number !== undefined && second.number !== undefined) return first.number - second.number;
  if (first.number !== undefined) return -1;
  if (second.number !== undefined) return 1;
  return (first.timestamp ?? '').localeCompare(second.timestamp ?? '');
}

function featureNumberedLayoutOf(view: ProjectFiles): FeatureNumberedLayout | undefined {
  if (!view.hasFolder(FEATURE_MARKER_FOLDER)) return undefined;
  const features = view
    .subfolderNamesOf(FEATURES_FOLDER)
    .flatMap((name) => featureFolderOf(name) ?? [])
    .sort(compareFeatures);
  return { kind: 'featureNumbered', folder: FEATURE_MARKER_FOLDER, features };
}

function requirementsDesignTasksLayoutOf(view: ProjectFiles): RequirementsDesignTasksLayout | undefined {
  const specs = view
    .subfolderNamesOf(REQUIREMENTS_DESIGN_TASKS_FOLDER)
    .map((name) => ({ name, folder: `${REQUIREMENTS_DESIGN_TASKS_FOLDER}/${name}` }));
  return specs.length === 0
    ? undefined
    : { kind: 'requirementsDesignTasks', folder: REQUIREMENTS_DESIGN_TASKS_FOLDER, specs };
}

function decisionRecordsLayoutOf(view: ProjectFiles): DecisionRecordsLayout | undefined {
  const records = DECISION_RECORD_FOLDERS.flatMap((folder) => view.filesDirectlyIn(folder)).flatMap(
    (path) => {
      const number = DECISION_RECORD.exec(path.split('/').at(-1) ?? '')?.[1];
      return number === undefined ? [] : [{ number, path }];
    },
  );
  return records.length === 0 ? undefined : { kind: 'decisionRecords', records };
}

function layoutsOf(view: ProjectFiles): SpecLayout[] {
  return [
    changeBasedLayoutOf(view),
    featureNumberedLayoutOf(view),
    requirementsDesignTasksLayoutOf(view),
    decisionRecordsLayoutOf(view),
  ].filter((layout) => layout !== undefined);
}

/** The first folder of each layout's own path, which is never a project folder of its own. */
function layoutTopFolders(layouts: readonly SpecLayout[]): Set<string> {
  const paths = layouts.flatMap((layout) =>
    layout.kind === 'decisionRecords'
      ? layout.records.map((record) => record.path)
      : [layout.folder, ...(layout.kind === 'featureNumbered' ? [FEATURES_FOLDER] : [])],
  );
  return new Set(paths.map((path) => keyOf(path.split('/')[0] ?? '')));
}

function subfolderCandidates(manifest: SpecProjectManifest, rootLayouts: readonly SpecLayout[]): string[] {
  const claimedByRoot = layoutTopFolders(rootLayouts);
  const firstParts = [...manifest.folders, ...manifest.files.map((file) => file.path)]
    .filter((path) => path.includes('/'))
    .map((path) => path.split('/')[0] ?? '');
  return uniqueInAnyCase(firstParts).filter(
    (name) => !name.startsWith('.') && !claimedByRoot.has(keyOf(name)),
  );
}

/** The spec projects of a scanned root: the root itself and its direct subfolders, each with its layouts. */
export function detectSpecProjects(manifest: SpecProjectManifest): DetectedSpecProject[] {
  const rootLayouts = layoutsOf(ProjectFiles.of(manifest, ''));
  const root: DetectedSpecProject = { folder: '', name: manifest.root.fileName, layouts: rootLayouts };
  const subfolderProjects = subfolderCandidates(manifest, rootLayouts).map((folder) => ({
    folder,
    name: folder,
    layouts: layoutsOf(ProjectFiles.of(manifest, folder)),
  }));
  return [root, ...subfolderProjects].filter((project) => project.layouts.length > 0);
}
