import {
  checkChange,
  topLevelYamlValue,
  type ChangeSummary,
  type SpecProjectSummary,
  type StructuralFinding,
} from '@mdx/core';
import type { SpecProjectManifest } from '@mdx/platform';

/** Reads a project file's text by its path relative to the scanned root; undefined when it cannot. */
export type ProjectTextReader = (relativePath: string) => Promise<string | undefined>;

const READ_FILE = /\.(?:md|markdown)$/i;

function joined(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}

async function changeFilesOf(
  manifest: SpecProjectManifest,
  change: ChangeSummary,
  readText: ProjectTextReader,
): Promise<Map<string, string>> {
  const prefix = `${change.folder}/`;
  const entries = await Promise.all(
    manifest.files
      .filter((file) => file.path.startsWith(prefix))
      .map(async (file) => {
        const text = READ_FILE.test(file.path) ? await readText(file.path) : file.text;
        return [file.path.slice(prefix.length), text ?? ''] as const;
      }),
  );
  return new Map(entries);
}

async function currentSpecsOf(
  project: SpecProjectSummary,
  change: ChangeSummary,
  readText: ProjectTextReader,
): Promise<Map<string, string>> {
  const specs = new Map<string, string>();
  for (const delta of change.documents.deltas) {
    const capability = project.capabilities.find((candidate) => candidate.name === delta.name);
    const text = capability === undefined ? undefined : await readText(capability.path);
    if (text !== undefined) specs.set(delta.name, text);
  }
  return specs;
}

function projectSchemaOf(manifest: SpecProjectManifest, project: SpecProjectSummary): string | undefined {
  const configuration = ['config.yaml', 'config.yml']
    .map((name) => joined(project.folder, `openspec/${name}`))
    .map((path) => manifest.files.find((file) => file.path === path)?.text)
    .find((text): text is string => typeof text === 'string');
  return configuration === undefined ? undefined : topLevelYamlValue(configuration, 'schema');
}

/** The structural findings of every active change of the projects, by change folder. */
export async function activeChangeFindings(
  manifest: SpecProjectManifest,
  projects: readonly SpecProjectSummary[],
  readText: ProjectTextReader,
): Promise<Map<string, readonly StructuralFinding[]>> {
  const findings = new Map<string, readonly StructuralFinding[]>();
  for (const project of projects) {
    const projectSchema = projectSchemaOf(manifest, project);
    for (const change of project.activeChanges) {
      const files = await changeFilesOf(manifest, change, readText);
      const currentSpecs = await currentSpecsOf(project, change, readText);
      findings.set(
        change.folder,
        checkChange({ files, currentSpecs, ...(projectSchema ? { projectSchema } : {}) }),
      );
    }
  }
  return findings;
}
