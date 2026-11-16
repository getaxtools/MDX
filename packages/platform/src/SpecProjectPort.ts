import type { OpenedDocument } from './DocumentFilePort';
import type { DocumentLocation } from './DocumentLocation';

/** The scan stops after this many files and says the project was only partly read. */
export const MAX_SCANNED_SPEC_FILES = 5_000;

/** A file a scan found, by its path relative to the project root with `/` between parts. */
export interface SpecProjectFile {
  readonly path: string;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
  /** The text of a small YAML or JSON file, read with the scan; null for other files. */
  readonly text: string | null;
}

/** A linked folder or file; it is followed only when its target is in a folder the user granted. */
export interface SpecProjectLink {
  readonly path: string;
  readonly isFollowed: boolean;
}

export interface SpecProjectManifest {
  readonly root: DocumentLocation;
  /** The folders inside spec locations, so an empty `specs` folder still counts. */
  readonly folders: readonly string[];
  readonly files: readonly SpecProjectFile[];
  readonly links: readonly SpecProjectLink[];
  /** True when a limit stopped the scan, so the project was only partly read. */
  readonly isIncomplete: boolean;
}

export interface SpecProjectPort {
  /**
   * Lists the spec and decision files of a chosen project root and of its direct subfolders, plus the
   * files of `additionalLocations`: patterns with `/` between parts, `*` in a name and `**` for any folders.
   */
  scanProject(root: string, additionalLocations: readonly string[]): Promise<SpecProjectManifest>;
  /** Reads a Markdown, YAML or JSON file of the project by its path relative to the root. */
  readProjectFile(root: string, relativePath: string): Promise<OpenedDocument>;
}
