import type { SpecProjectManifest } from '@mdx/platform';
import type { DetectedSpecProject, FeatureFolder } from '../detection/detectSpecProjects';
import type { ProjectFiles } from '../detection/ProjectFiles';
import {
  clarificationMarkersIn,
  currentFeatureOf,
  featureDocumentsOf,
  featureStatusOf,
  type ClarificationMarker,
  type FeatureDocuments,
} from '../feature-numbered/featureDetails';
import { readFeatureTasks, type FeatureTasks } from '../feature-numbered/readFeatureTasks';
import type { TaskProgress } from '../tasks/countTaskProgress';

export interface FeatureSummary {
  /** The folder name, which is also the feature's branch name. */
  readonly name: string;
  /** The feature folder relative to the scanned root. */
  readonly folder: string;
  readonly number?: number | undefined;
  readonly timestamp?: string | undefined;
  /** True for the feature the current-feature file or the Git branch points to. */
  readonly isCurrent: boolean;
  readonly documents: FeatureDocuments;
  /** The spec's `**Status**` value, such as `Draft`. */
  readonly status?: string | undefined;
  readonly clarifications: readonly ClarificationMarker[];
  /** Undefined until its tasks document has been read, or when it has none. */
  readonly tasks?: FeatureTasks | undefined;
  readonly progress?: TaskProgress | undefined;
}

export interface ProjectReport {
  readonly name: string;
  readonly path: string;
}

const MARKER_FOLDER = '.specify';
const CONSTITUTION = `${MARKER_FOLDER}/memory/constitution.md`;
const FEATURE_FILE = `${MARKER_FOLDER}/feature.json`;
const GIT_HEAD = '.git/HEAD';
const NOT_REPORT_FOLDERS = ['memory', 'templates', 'scripts', 'extensions'];
const MARKDOWN_FILE = /\.(?:md|markdown)$/i;

function joined(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}

function textOf(manifest: SpecProjectManifest, path: string): string | undefined {
  return manifest.files.find((file) => file.path === path)?.text ?? undefined;
}

function markdownDocumentsOf(documents: FeatureDocuments): string[] {
  const named = [
    documents.spec,
    documents.plan,
    documents.tasks,
    documents.research,
    documents.dataModel,
    documents.quickstart,
  ];
  return [
    ...named.filter((path) => path !== undefined),
    ...documents.contracts,
    ...documents.checklists,
  ].filter((path) => MARKDOWN_FILE.test(path));
}

interface FeatureReading {
  readonly projectFolder: string;
  readonly paths: readonly string[];
  readonly documentTexts: ReadonlyMap<string, string>;
  readonly currentName?: string | undefined;
}

function featureSummaryOf(feature: FeatureFolder, reading: FeatureReading): FeatureSummary {
  const folder = joined(reading.projectFolder, feature.folder);
  const documents = featureDocumentsOf(folder, reading.paths);
  const specText = documents.spec === undefined ? undefined : reading.documentTexts.get(documents.spec);
  const tasksText = documents.tasks === undefined ? undefined : reading.documentTexts.get(documents.tasks);
  const tasks = tasksText === undefined ? undefined : readFeatureTasks(tasksText);
  return {
    name: feature.name,
    folder,
    number: feature.number,
    timestamp: feature.timestamp,
    isCurrent: feature.name === reading.currentName,
    documents,
    status: specText === undefined ? undefined : featureStatusOf(specText),
    clarifications: markdownDocumentsOf(documents).flatMap((path) => {
      const text = reading.documentTexts.get(path);
      return text === undefined ? [] : clarificationMarkersIn(path, text);
    }),
    tasks,
    progress: tasks && { done: tasks.tasks.filter((task) => task.isDone).length, total: tasks.tasks.length },
  };
}

export interface FeatureNumberedParts {
  readonly features: readonly FeatureSummary[];
  readonly constitution?: string | undefined;
  readonly reports: readonly ProjectReport[];
}

/** The features, constitution and other reports of a feature-numbered project. */
export interface FeatureNumberedReading {
  readonly manifest: SpecProjectManifest;
  readonly project: DetectedSpecProject;
  readonly files: ProjectFiles;
  readonly documentTexts: ReadonlyMap<string, string>;
}

export function featureNumberedPartsOf({
  manifest,
  project,
  files,
  documentTexts,
}: FeatureNumberedReading): FeatureNumberedParts {
  const layout = project.layouts.find((candidate) => candidate.kind === 'featureNumbered');
  if (!layout) return { features: [], reports: [] };
  const currentName = currentFeatureOf(layout.features, {
    featureFileText: files.textOf(FEATURE_FILE),
    gitHeadText: textOf(manifest, GIT_HEAD),
  });
  const paths = files.files.map((file) => joined(project.folder, file.path));
  const reading: FeatureReading = { projectFolder: project.folder, paths, documentTexts, currentName };
  const reports = files
    .filesBelow(MARKER_FOLDER)
    .filter((path) => MARKDOWN_FILE.test(path) && !NOT_REPORT_FOLDERS.includes(path.split('/')[1] ?? ''))
    .map((path) => ({ name: path.slice(MARKER_FOLDER.length + 1), path: joined(project.folder, path) }));
  return {
    features: layout.features.map((feature) => featureSummaryOf(feature, reading)),
    constitution: files.hasFile(CONSTITUTION) ? joined(project.folder, CONSTITUTION) : undefined,
    reports,
  };
}

/** The Markdown documents of every feature, which give the status, the clarifications and the tasks. */
export function featureDocumentsToRead(features: readonly FeatureSummary[]): string[] {
  return features.flatMap((feature) => markdownDocumentsOf(feature.documents));
}
