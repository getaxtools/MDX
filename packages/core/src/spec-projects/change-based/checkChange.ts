import { checkDeltaSpec } from './checkDeltaSpec';
import { checkScenarioLoss } from './checkScenarioLoss';
import { checkTaskDocuments } from './checkTaskDocuments';
import { parseDeltaSpec, type DeltaSpec } from './parseDeltaSpec';
import { parseMainSpec } from './parseMainSpec';
import { CHANGE_METADATA_FILE, readChangeMetadata, type ChangeMetadata } from './readChangeMetadata';
import { findingOf, type StructuralFinding } from './structuralFindings';

export interface ChangeCheckInput {
  /** Every file of the change folder by its path relative to the folder; Markdown and YAML files with their text. */
  readonly files: ReadonlyMap<string, string>;
  /** The current spec text of each capability, by its path under the project's `specs` folder. */
  readonly currentSpecs: ReadonlyMap<string, string>;
  /** The schema the project configuration names, used when the change names none. */
  readonly projectSchema?: string;
}

export interface DeltaSpecFile {
  /** The capability path, such as `identity/user-auth`. */
  readonly capability: string;
  readonly path: string;
  readonly delta: DeltaSpec;
}

const SPECS_FOLDER = 'specs/';
const DELTA_FILE_NAME = 'spec.md';
const ROOT_DELTA_FILE = `${SPECS_FOLDER}${DELTA_FILE_NAME}`;
const TASKS_FILE = 'tasks.md';
const BUILT_IN_SCHEMA = 'spec-driven';

function isUnderSpecsWithoutDotParts(path: string): boolean {
  return path.startsWith(SPECS_FOLDER) && !path.split('/').some((part) => part.startsWith('.'));
}

/** The delta files the spec tool applies: a `spec.md` inside a capability folder under `specs`. */
export function deltaSpecFilesOf(files: ReadonlyMap<string, string>): DeltaSpecFile[] {
  return [...files.keys()]
    .filter((path) => isUnderSpecsWithoutDotParts(path) && path !== ROOT_DELTA_FILE)
    .filter((path) => path.split('/').at(-1) === DELTA_FILE_NAME)
    .sort()
    .map((path) => ({
      capability: path.slice(SPECS_FOLDER.length, -`/${DELTA_FILE_NAME}`.length),
      path,
      delta: parseDeltaSpec(files.get(path) ?? ''),
    }));
}

function entryCountOf(delta: DeltaSpec): number {
  return delta.added.length + delta.modified.length + delta.removed.length + delta.renamed.length;
}

/** Other Markdown files under `specs` that hold delta sections, which archiving would never read. */
function unreadDeltaFiles(files: ReadonlyMap<string, string>): string[] {
  return [...files.keys()]
    .filter((path) => isUnderSpecsWithoutDotParts(path) && path.toLowerCase().endsWith('.md'))
    .filter((path) => path.split('/').at(-1) !== DELTA_FILE_NAME)
    .filter((path) => parseDeltaSpec(files.get(path) ?? '').sections.length > 0)
    .sort();
}

function deltaFindings(input: ChangeCheckInput, deltaFiles: readonly DeltaSpecFile[]): StructuralFinding[] {
  return deltaFiles.flatMap(({ capability, path, delta }) => {
    const currentSpec = input.currentSpecs.get(capability);
    const scenarioLoss =
      currentSpec !== undefined && delta.modified.length > 0
        ? checkScenarioLoss(path, delta, parseMainSpec(currentSpec))
        : [];
    return [...checkDeltaSpec(path, delta), ...scenarioLoss];
  });
}

function metadataFindings(metadata: ChangeMetadata): StructuralFinding[] {
  const findings: StructuralFinding[] = [];
  if (metadata.mentionsSkipSpecs && !metadata.isSkippingSpecs) {
    findings.push(findingOf('skipSpecsWithInvalidMetadata', { path: CHANGE_METADATA_FILE }));
  }
  if (metadata.unknownKeys.length > 0) {
    findings.push(
      findingOf('unknownMetadataKey', {
        path: CHANGE_METADATA_FILE,
        subject: metadata.unknownKeys.join(', '),
      }),
    );
  }
  return findings;
}

function deltaPresenceFindings(
  input: ChangeCheckInput,
  deltaFiles: readonly DeltaSpecFile[],
  metadata: ChangeMetadata,
) {
  const hasRootDeltaFile = input.files.has(ROOT_DELTA_FILE);
  const unread = unreadDeltaFiles(input.files);
  const hasAnyFileUnderSpecs = [...input.files.keys()].some(isUnderSpecsWithoutDotParts);
  const totalEntries = deltaFiles.reduce((total, file) => total + entryCountOf(file.delta), 0);
  const findings = unread.map((path) => findingOf('deltaFileNotNamedSpec', { path }));
  if (hasRootDeltaFile) findings.push(findingOf('deltaFileAtSpecsRoot', { path: ROOT_DELTA_FILE }));
  if (metadata.isSkippingSpecs && hasAnyFileUnderSpecs)
    findings.push(findingOf('skipSpecsWithDeltaFiles', { path: '' }));
  if (totalEntries === 0 && !hasRootDeltaFile && unread.length === 0 && !metadata.isSkippingSpecs) {
    findings.push(findingOf('changeWithoutDeltas', { path: '' }));
  }
  return findings;
}

// The tool checks the files its schema tracks as tasks; the viewer knows that only for the built-in schema,
// which tracks `tasks.md`, so other schemas get no task checks.
function taskFindings(input: ChangeCheckInput, metadata: ChangeMetadata): StructuralFinding[] {
  const schema = metadata.schema ?? input.projectSchema ?? BUILT_IN_SCHEMA;
  const tasks = input.files.get(TASKS_FILE);
  if (schema !== BUILT_IN_SCHEMA || tasks === undefined) return [];
  return checkTaskDocuments([{ path: TASKS_FILE, text: tasks }], { isNumberingChecked: true });
}

function byPlace(first: StructuralFinding, second: StructuralFinding): number {
  return first.path.localeCompare(second.path) || (first.line ?? 0) - (second.line ?? 0);
}

/** The structural findings of an active change, following the checks of the spec tool 2.0.0 that the viewer covers. */
export function checkChange(input: ChangeCheckInput): StructuralFinding[] {
  const metadata = readChangeMetadata(input.files.get(CHANGE_METADATA_FILE));
  const deltaFiles = deltaSpecFilesOf(input.files);
  return [
    ...deltaFindings(input, deltaFiles),
    ...deltaPresenceFindings(input, deltaFiles, metadata),
    ...metadataFindings(metadata),
    ...taskFindings(input, metadata),
  ].sort(byPlace);
}
