import type { FeatureFolder } from '../detection/detectSpecProjects';

export interface FeatureDocuments {
  readonly spec?: string | undefined;
  readonly plan?: string | undefined;
  readonly tasks?: string | undefined;
  readonly research?: string | undefined;
  readonly dataModel?: string | undefined;
  readonly quickstart?: string | undefined;
  readonly contracts: readonly string[];
  readonly checklists: readonly string[];
}

export interface ClarificationMarker {
  readonly path: string;
  /** Counted from 1. */
  readonly line: number;
}

const NAMED_DOCUMENTS = {
  spec: 'spec.md',
  plan: 'plan.md',
  tasks: 'tasks.md',
  research: 'research.md',
  dataModel: 'data-model.md',
  quickstart: 'quickstart.md',
} as const;
const STATUS_LINE = /^\*\*Status\*\*:\s*(.+?)\s*$/m;
const CLARIFICATION_MARKER = 'NEEDS CLARIFICATION';
const BRANCH_REFERENCE = /^ref:\s*refs\/heads\/(.+?)\s*$/m;

/** The documents of a feature folder, by path relative to the scanned root; missing ones are undefined. */
export function featureDocumentsOf(featureFolder: string, paths: readonly string[]): FeatureDocuments {
  const pathSet = new Set(paths);
  const present = (name: string) => {
    const path = `${featureFolder}/${name}`;
    return pathSet.has(path) ? path : undefined;
  };
  const below = (folder: string) =>
    paths.filter((path) => path.startsWith(`${featureFolder}/${folder}/`)).sort();
  return {
    spec: present(NAMED_DOCUMENTS.spec),
    plan: present(NAMED_DOCUMENTS.plan),
    tasks: present(NAMED_DOCUMENTS.tasks),
    research: present(NAMED_DOCUMENTS.research),
    dataModel: present(NAMED_DOCUMENTS.dataModel),
    quickstart: present(NAMED_DOCUMENTS.quickstart),
    contracts: below('contracts'),
    checklists: below('checklists'),
  };
}

/** The value of the spec's `**Status**:` line, such as `Draft`. */
export function featureStatusOf(specText: string): string | undefined {
  return STATUS_LINE.exec(specText.replace(/\r\n?/g, '\n'))?.[1];
}

export function clarificationMarkersIn(path: string, text: string): ClarificationMarker[] {
  return text.split(/\r\n|\r|\n/).flatMap((line, index) => {
    const count = line.split(CLARIFICATION_MARKER).length - 1;
    return Array.from({ length: count }, () => ({ path, line: index + 1 }));
  });
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn);
  return [];
}

function featureNamedIn(
  candidates: readonly string[],
  features: readonly FeatureFolder[],
): string | undefined {
  for (const candidate of candidates) {
    const lastPart =
      candidate
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/)
        .at(-1) ?? '';
    const feature = features.find((entry) => entry.name === lastPart);
    if (feature) return feature.name;
  }
  return undefined;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The feature the project works on: the one the current-feature file names, or else the one the Git branch is
 * named after. The file's exact shape is not relied on; any value naming a feature folder counts.
 */
export function currentFeatureOf(
  features: readonly FeatureFolder[],
  sources: { readonly featureFileText?: string | undefined; readonly gitHeadText?: string | undefined },
): string | undefined {
  const fromFile =
    sources.featureFileText === undefined
      ? undefined
      : featureNamedIn(stringsIn(parsedJson(sources.featureFileText)), features);
  if (fromFile !== undefined) return fromFile;
  const branch =
    sources.gitHeadText === undefined ? undefined : BRANCH_REFERENCE.exec(sources.gitHeadText)?.[1];
  return branch === undefined ? undefined : featureNamedIn([branch], features);
}
