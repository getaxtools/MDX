import { readTopLevelYamlEntries, type TopLevelYamlEntry } from '../yaml/readTopLevelYamlEntries';

export type ChangeMetadataProblem = 'missingSchema' | 'invalidCreatedDate' | 'invalidSkipSpecs';

/** A change's `.openspec.yaml`, read key by key. */
export interface ChangeMetadata {
  readonly schema?: string | undefined;
  /** The creation day as `YYYY-MM-DD`, only when it is a real date. */
  readonly created?: string | undefined;
  /** True when the change says it has no spec deltas and the rest of its metadata is valid. */
  readonly isSkippingSpecs: boolean;
  /** True when `skip_specs` is set to anything other than false. */
  readonly mentionsSkipSpecs: boolean;
  /** Keys the spec tool does not know; `x-` extension keys are not listed. */
  readonly unknownKeys: readonly string[];
  readonly problems: readonly ChangeMetadataProblem[];
}

export const CHANGE_METADATA_FILE = '.openspec.yaml';

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'schema',
  'created',
  'goal',
  'affected_areas',
  'initiative',
  'skip_specs',
  'retire_capabilities',
]);
const EXTENSION_KEY = /^x-\S+$/;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const YAML_TRUE = new Set(['true', 'True', 'TRUE']);
const YAML_FALSE = new Set(['false', 'False', 'FALSE']);

const NO_METADATA: ChangeMetadata = {
  isSkippingSpecs: false,
  mentionsSkipSpecs: false,
  unknownKeys: [],
  problems: [],
};

function isRealDate(text: string): boolean {
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

function problemsOf(values: ReadonlyMap<string, string>): ChangeMetadataProblem[] {
  const created = values.get('created');
  const skipSpecs = values.get('skip_specs');
  const problems: ChangeMetadataProblem[] = [];
  if ((values.get('schema') ?? '') === '') problems.push('missingSchema');
  if (created !== undefined && !(DATE_FORMAT.test(created) && isRealDate(created)))
    problems.push('invalidCreatedDate');
  if (skipSpecs !== undefined && !YAML_TRUE.has(skipSpecs) && !YAML_FALSE.has(skipSpecs)) {
    problems.push('invalidSkipSpecs');
  }
  return problems;
}

/**
 * Whether the spec tool would honour `skip_specs: true`: its own date rule checks the format only.
 * The tool also requires the schema to exist in its schema registry, which the viewer cannot see, so
 * any schema name counts here.
 */
function honoursSkipSpecs(
  values: ReadonlyMap<string, string>,
  problems: readonly ChangeMetadataProblem[],
): boolean {
  const created = values.get('created');
  const isCreatedAccepted = created === undefined || DATE_FORMAT.test(created);
  const blockingProblems = problems.filter((problem) => problem !== 'invalidCreatedDate');
  return YAML_TRUE.has(values.get('skip_specs') ?? '') && isCreatedAccepted && blockingProblems.length === 0;
}

function valuesOf(entries: readonly TopLevelYamlEntry[]): Map<string, string> {
  return new Map(entries.map((entry) => [entry.key, entry.value]));
}

export function readChangeMetadata(text: string | undefined): ChangeMetadata {
  if (text === undefined) return NO_METADATA;
  const entries = readTopLevelYamlEntries(text);
  const values = valuesOf(entries);
  const problems = problemsOf(values);
  const created = values.get('created');
  const skipSpecs = values.get('skip_specs');
  return {
    schema: problems.includes('missingSchema') ? undefined : values.get('schema'),
    created: created !== undefined && !problems.includes('invalidCreatedDate') ? created : undefined,
    isSkippingSpecs: honoursSkipSpecs(values, problems),
    mentionsSkipSpecs: skipSpecs !== undefined && !YAML_FALSE.has(skipSpecs),
    unknownKeys: [...new Set(entries.map((entry) => entry.key))]
      .filter((key) => !KNOWN_KEYS.has(key) && !EXTENSION_KEY.test(key))
      .sort(),
    problems,
  };
}
