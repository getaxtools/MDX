import type { OpenedDocument } from './DocumentFilePort';
import type { DocumentLocation } from './DocumentLocation';
import type { FolderSearchResults, TextSearchOptions } from './FolderPort';

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

/** A scanned folder to watch, with the linked folders its scan followed, by their paths relative to it. */
export interface WatchedSpecProject {
  readonly root: string;
  readonly followedLinks: readonly string[];
}

/** Documents of a scanned root, by their paths relative to it. */
export interface ProjectDocuments {
  readonly root: string;
  readonly relativePaths: readonly string[];
}

export type SpecProjectsChangedListener = (folderPaths: readonly string[]) => void;

export interface SpecProjectPort {
  /**
   * Lists the spec and decision files of a chosen project root and of its direct subfolders, plus the
   * files of `additionalLocations`: patterns with `/` between parts, `*` in a name and `**` for any folders.
   */
  scanProject(root: string, additionalLocations: readonly string[]): Promise<SpecProjectManifest>;
  /** Reads a Markdown, YAML, JSON or instruction file of the project by its path relative to the root. */
  readProjectFile(root: string, relativePath: string): Promise<OpenedDocument>;
  /**
   * Asks the user in a system dialog before a linked folder of the project that leads outside the chosen
   * folders is followed; resolves to whether the user agreed, after which a scan follows the link.
   */
  followLink(root: string, linkPath: string): Promise<boolean>;
  /** Finds text in Markdown documents of a scanned root, hidden spec folders included, by relative path. */
  searchProjectDocuments(
    documents: ProjectDocuments,
    query: string,
    options: TextSearchOptions,
  ): Promise<FolderSearchResults>;
  /**
   * Watches these scanned folders with every folder below them and the folders their followed links lead to,
   * in place of the folders watched before; only changes a scan with these extra locations could see count.
   */
  watchProjects(
    projects: readonly WatchedSpecProject[],
    additionalLocations: readonly string[],
  ): Promise<void>;
  /** Tells the listener which watched folders had a file added, saved, renamed or removed below them. */
  onProjectsChanged(listener: SpecProjectsChangedListener): () => void;
}
