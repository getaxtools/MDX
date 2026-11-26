import type { DetectedSpecProject } from '../detection/detectSpecProjects';
import type { ProjectFiles } from '../detection/ProjectFiles';
import { countTaskProgress, type TaskProgress } from '../tasks/countTaskProgress';
import { readTopLevelYamlEntries } from '../yaml/readTopLevelYamlEntries';

/** A spec of a requirements, design and tasks folder. */
export interface FolderSpecSummary {
  readonly name: string;
  /** The spec folder relative to the scanned root. */
  readonly folder: string;
  /** A bug fix spec holds `bugfix.md` in place of `requirements.md`. */
  readonly isBugfix: boolean;
  readonly requirements?: string | undefined;
  readonly design?: string | undefined;
  readonly tasks?: string | undefined;
  readonly progress?: TaskProgress | undefined;
}

export interface DecisionRecordSummary {
  /** The number prefix as written, such as `0003`. */
  readonly number: string;
  readonly path: string;
  readonly title?: string | undefined;
  readonly status?: string | undefined;
  readonly date?: string | undefined;
}

const FRONT_MATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
const FIRST_HEADING = /^#\s+(.+?)\s*#*\s*$/m;
const NUMBER_PREFIX = /^\d+\.\s+/;
const STATUS_HEADING = /^##\s+Status\s*$/i;
const DATE_LINE = /^Date:\s*(.+?)\s*$/im;

function joined(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}

function frontMatterValue(text: string, key: string): string | undefined {
  const block = FRONT_MATTER.exec(text)?.[1];
  if (block === undefined) return undefined;
  const value = readTopLevelYamlEntries(block).find((entry) => entry.key === key)?.value;
  return value === '' ? undefined : value;
}

/** The first line of text under a `## Status` heading, as adr-tools writes it. */
function statusSectionOf(text: string): string | undefined {
  const lines = text.split(/\r\n|\r|\n/);
  const heading = lines.findIndex((line) => STATUS_HEADING.test(line));
  if (heading === -1) return undefined;
  const line = lines.slice(heading + 1).find((candidate) => candidate.trim() !== '');
  return line === undefined || line.startsWith('#') ? undefined : line.trim();
}

/** Number, title, status and date of a decision record, from front matter or its Status section. */
export function decisionRecordOf(
  number: string,
  path: string,
  text: string | undefined,
): DecisionRecordSummary {
  if (text === undefined) return { number, path };
  const body = text.replace(FRONT_MATTER, '');
  const heading = FIRST_HEADING.exec(body)?.[1];
  return {
    number,
    path,
    title: heading?.replace(NUMBER_PREFIX, ''),
    status: frontMatterValue(text, 'status') ?? statusSectionOf(body),
    date: frontMatterValue(text, 'date') ?? DATE_LINE.exec(body)?.[1],
  };
}

export interface FolderLayoutParts {
  readonly folderSpecs: readonly FolderSpecSummary[];
  readonly decisionRecords: readonly DecisionRecordSummary[];
}

/** The specs of a requirements, design and tasks folder, and the decision records, of a project. */
export function folderLayoutPartsOf(
  project: DetectedSpecProject,
  files: ProjectFiles,
  documentTexts: ReadonlyMap<string, string>,
): FolderLayoutParts {
  const pathIn = (folder: string, name: string) =>
    files.hasFile(`${folder}/${name}`) ? joined(project.folder, `${folder}/${name}`) : undefined;
  const folderSpecs = project.layouts.flatMap((layout) =>
    layout.kind !== 'requirementsDesignTasks'
      ? []
      : layout.specs.map((spec): FolderSpecSummary => {
          const tasks = pathIn(spec.folder, 'tasks.md');
          const tasksText = tasks === undefined ? undefined : documentTexts.get(tasks);
          const bugfix = pathIn(spec.folder, 'bugfix.md');
          return {
            name: spec.name,
            folder: joined(project.folder, spec.folder),
            isBugfix: bugfix !== undefined,
            requirements: pathIn(spec.folder, 'requirements.md') ?? bugfix,
            design: pathIn(spec.folder, 'design.md'),
            tasks,
            progress: tasksText === undefined ? undefined : countTaskProgress(tasksText),
          };
        }),
  );
  const decisionRecords = project.layouts.flatMap((layout) =>
    layout.kind !== 'decisionRecords'
      ? []
      : layout.records.map((record) => {
          const path = joined(project.folder, record.path);
          return decisionRecordOf(record.number, path, documentTexts.get(path));
        }),
  );
  return { folderSpecs, decisionRecords };
}

/** The documents the overview reads for these layouts: tasks for progress, records for their details. */
export function folderLayoutDocumentsToRead(parts: FolderLayoutParts): string[] {
  return [
    ...parts.folderSpecs.flatMap((spec) => spec.tasks ?? []),
    ...parts.decisionRecords.map((record) => record.path),
  ];
}
