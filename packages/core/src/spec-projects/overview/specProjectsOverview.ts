import type { SpecProjectLink, SpecProjectManifest } from '@mdx/platform';
import { isAgentInstructionFile } from '../agent-files/agentInstructionLocations';
import {
  detectSpecProjects,
  type DetectedSpecProject,
  type SpecLayoutKind,
} from '../detection/detectSpecProjects';
import { ProjectFiles } from '../detection/ProjectFiles';
import { countTaskProgress, type TaskProgress } from '../tasks/countTaskProgress';

/** A document of a project, by its path relative to the scanned root. */
export interface ProjectDocument {
  readonly name: string;
  readonly path: string;
}

export interface ChangeDocuments {
  readonly proposal?: string | undefined;
  readonly design?: string | undefined;
  readonly tasks?: string | undefined;
  /** The spec deltas, named by their capability path. */
  readonly deltas: readonly ProjectDocument[];
}

export interface ChangeSummary {
  readonly name: string;
  /** The change folder, relative to the scanned root. */
  readonly folder: string;
  /** For an archived change, the `YYYY-MM-DD` prefix of its folder. */
  readonly archivedOn?: string | undefined;
  readonly documents: ChangeDocuments;
  /** Undefined until its tasks document has been read, or when it has none. */
  readonly progress?: TaskProgress | undefined;
}

export interface SpecProjectSummary {
  readonly name: string;
  /** The project folder relative to the scanned root; empty for the root itself. */
  readonly folder: string;
  readonly layouts: readonly SpecLayoutKind[];
  /** Named when the specs live in a separate planning store the user can add as another root. */
  readonly planningStore?: string | undefined;
  readonly capabilities: readonly ProjectDocument[];
  readonly activeChanges: readonly ChangeSummary[];
  /** Newest first. */
  readonly archivedChanges: readonly ChangeSummary[];
  readonly agentInstructions: readonly ProjectDocument[];
  readonly linkedFolders: readonly SpecProjectLink[];
}

const CHANGE_BASED_FOLDER = 'openspec';
const ARCHIVE_FOLDER = 'archive';
const SPEC_FILE = 'spec.md';
const ARCHIVED_CHANGE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const MARKDOWN_FILE = /\.(?:md|markdown|mdc)$/i;

function joined(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}

function capabilitiesOf(files: ProjectFiles, projectFolder: string): ProjectDocument[] {
  const specsFolder = `${CHANGE_BASED_FOLDER}/specs`;
  return files
    .filesBelow(specsFolder)
    .filter((path) => path.endsWith(`/${SPEC_FILE}`))
    .map((path) => ({
      name: path.slice(specsFolder.length + 1, -SPEC_FILE.length - 1),
      path: joined(projectFolder, path),
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

function documentsOfChange(
  files: ProjectFiles,
  changeFolder: string,
  projectFolder: string,
): ChangeDocuments {
  const pathIfPresent = (name: string) => {
    const path = `${changeFolder}/${name}`;
    return files.hasFile(path) ? joined(projectFolder, path) : undefined;
  };
  const deltasFolder = `${changeFolder}/specs`;
  const deltas = files
    .filesBelow(deltasFolder)
    .filter((path) => path.endsWith(`/${SPEC_FILE}`))
    .map((path) => ({
      name: path.slice(deltasFolder.length + 1, -SPEC_FILE.length - 1),
      path: joined(projectFolder, path),
    }));
  return {
    proposal: pathIfPresent('proposal.md'),
    design: pathIfPresent('design.md'),
    tasks: pathIfPresent('tasks.md'),
    deltas,
  };
}

interface ChangeReading {
  readonly files: ProjectFiles;
  readonly projectFolder: string;
  readonly taskTexts: ReadonlyMap<string, string>;
}

function changeOf(reading: ChangeReading, changesFolder: string, folderName: string): ChangeSummary {
  const changeFolder = `${changesFolder}/${folderName}`;
  const documents = documentsOfChange(reading.files, changeFolder, reading.projectFolder);
  const tasksText = documents.tasks === undefined ? undefined : reading.taskTexts.get(documents.tasks);
  const archived = ARCHIVED_CHANGE.exec(folderName);
  return {
    name: archived?.[2] ?? folderName,
    folder: joined(reading.projectFolder, changeFolder),
    archivedOn: archived?.[1],
    documents,
    progress: tasksText === undefined ? undefined : countTaskProgress(tasksText),
  };
}

function changesOf(reading: ChangeReading): Pick<SpecProjectSummary, 'activeChanges' | 'archivedChanges'> {
  const changesFolder = `${CHANGE_BASED_FOLDER}/changes`;
  const archiveFolder = `${changesFolder}/${ARCHIVE_FOLDER}`;
  const activeChanges = reading.files
    .subfolderNamesOf(changesFolder)
    .filter((name) => name.toLowerCase() !== ARCHIVE_FOLDER)
    .map((name) => changeOf(reading, changesFolder, name));
  const archivedChanges = reading.files
    .subfolderNamesOf(archiveFolder)
    .map((name) => changeOf(reading, archiveFolder, name))
    .sort(
      (first, second) =>
        (second.archivedOn ?? '').localeCompare(first.archivedOn ?? '') ||
        first.name.localeCompare(second.name),
    );
  return { activeChanges, archivedChanges };
}

function agentInstructionsOf(files: ProjectFiles, projectFolder: string): ProjectDocument[] {
  return files.files
    .map((file) => file.path)
    .filter((path) => MARKDOWN_FILE.test(path) && isAgentInstructionFile(path))
    .map((path) => ({ name: path.split('/').at(-1) ?? path, path: joined(projectFolder, path) }))
    .sort((first, second) => first.path.localeCompare(second.path));
}

function linkedFoldersOf(manifest: SpecProjectManifest, projectFolder: string): SpecProjectLink[] {
  const prefix = projectFolder === '' ? '' : `${projectFolder.toLowerCase()}/`;
  return manifest.links.filter((link) => link.path.toLowerCase().startsWith(prefix));
}

/**
 * The spec projects of a scanned root as the sidebar and dashboard show them. `taskTexts` holds the tasks
 * documents read so far, by path relative to the root; a change whose tasks were not read has no progress yet.
 */
export function specProjectsOverview(
  manifest: SpecProjectManifest,
  taskTexts: ReadonlyMap<string, string> = new Map(),
): SpecProjectSummary[] {
  const projects = detectSpecProjects(manifest).map((project) => summaryOf(manifest, project, taskTexts));
  const hasRootProject = projects.some((project) => project.folder === '');
  if (hasRootProject || manifest.links.length === 0) return projects;
  // A root whose spec folder is a link not followed yet still shows, so the user sees the link.
  const linkedRoot = summaryOf(
    manifest,
    { folder: '', name: manifest.root.fileName, layouts: [] },
    taskTexts,
  );
  return [linkedRoot, ...projects];
}

function summaryOf(
  manifest: SpecProjectManifest,
  project: DetectedSpecProject,
  taskTexts: ReadonlyMap<string, string>,
): SpecProjectSummary {
  const files = ProjectFiles.of(manifest, project.folder);
  const changeBased = project.layouts.find((layout) => layout.kind === 'changeBased');
  const hasChanges = changeBased !== undefined && changeBased.planningStore === undefined;
  const reading: ChangeReading = { files, projectFolder: project.folder, taskTexts };
  return {
    name: project.name,
    folder: project.folder,
    layouts: project.layouts.map((layout) => layout.kind),
    planningStore: changeBased?.planningStore,
    capabilities: hasChanges ? capabilitiesOf(files, project.folder) : [],
    ...(hasChanges ? changesOf(reading) : { activeChanges: [], archivedChanges: [] }),
    agentInstructions: agentInstructionsOf(files, project.folder),
    linkedFolders: linkedFoldersOf(manifest, project.folder),
  };
}

/** The tasks documents of the active changes, which the overview needs read to show progress. */
export function activeTaskDocumentsOf(projects: readonly SpecProjectSummary[]): string[] {
  return projects.flatMap((project) =>
    project.activeChanges.flatMap((change) => change.documents.tasks ?? []),
  );
}
