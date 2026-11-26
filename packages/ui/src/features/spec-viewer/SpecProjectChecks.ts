import type { IgnoreEntry } from '@mdx/core';
import type { DocumentLocation } from '@mdx/platform';
import type { InjectionChecker, ProjectFile, ProjectFileSummary } from '../prompt-injection/InjectionChecker';
import type { ProjectTextReader } from './activeChangeFindings';
import { fullPathOf } from './specProjectTree';

const CHECKED_FILE = /\.(?:md|markdown|mdc)$/i;

/** The documents of one scanned folder: its spec documents and agent instruction files. */
export interface ScannedDocuments {
  readonly root: DocumentLocation;
  /** Relative to the folder, with `/` between parts. */
  readonly paths: readonly string[];
  /** Reads a file of the scan; one the scan read already is not read again. */
  readonly readText: ProjectTextReader;
}

export interface SpecProjectChecksDependencies {
  /** A checker of its own, so a project check never cancels the check of the shown document. */
  readonly checker: Pick<InjectionChecker, 'checkDocuments' | 'cancel'>;
  readonly ignoreEntries: () => readonly IgnoreEntry[];
  readonly onChange: () => void;
}

/** The documents agents read in a scan, by their canonical path, which keys their ignore entries. */
function checkedFilesOf(
  documents: ScannedDocuments,
): { readonly file: ProjectFile; readonly displayPath: string }[] {
  const { root, paths, readText } = documents;
  const isCaseFolded = root.canonicalKey !== root.displayPath;
  return paths
    .filter((path) => CHECKED_FILE.test(path))
    .map((path) => {
      const displayPath = fullPathOf(root, path);
      const location = isCaseFolded ? displayPath.toLowerCase() : displayPath;
      return {
        displayPath,
        file: { location, readText: async () => (await readText(path)) ?? '' },
      };
    });
}

/**
 * Checks the spec documents and agent instruction files of the shown projects for prompt injection,
 * one file at a time, and keeps each file's findings for a quiet badge in the sidebar.
 */
export class SpecProjectChecks {
  private summaries: ReadonlyMap<string, ProjectFileSummary> = new Map();

  constructor(private readonly dependencies: SpecProjectChecksDependencies) {}

  /** The findings of each checked document with any, by its full path; empty until a check ends. */
  findings(): ReadonlyMap<string, ProjectFileSummary> {
    return this.summaries;
  }

  /** Checks every document again; a newer check replaces one still running. */
  async check(scanned: readonly ScannedDocuments[]): Promise<void> {
    const { checker, ignoreEntries, onChange } = this.dependencies;
    const files = scanned.flatMap(checkedFilesOf);
    const results = await checker.checkDocuments(
      files.map(({ file }) => file),
      { ignoreEntries: ignoreEntries() },
    );
    if (!results) return;
    const displayPathByLocation = new Map(files.map(({ file, displayPath }) => [file.location, displayPath]));
    this.summaries = new Map(
      results
        .filter((summary) => summary.findingCount > 0)
        .map((summary) => [displayPathByLocation.get(summary.location) ?? summary.location, summary]),
    );
    onChange();
  }

  clear(): void {
    this.dependencies.checker.cancel();
    if (this.summaries.size === 0) return;
    this.summaries = new Map();
    this.dependencies.onChange();
  }
}
