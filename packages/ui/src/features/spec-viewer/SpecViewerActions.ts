import {
  activeTaskDocumentsOf,
  AGENT_INSTRUCTION_LOCATIONS,
  specProjectsOverview,
  specSearchPathsOf,
  type SpecSearchFilter,
} from '@mdx/core';
import type {
  FolderSearchResults,
  SpecProjectManifest,
  SpecProjectPort,
  TextSearchOptions,
  WatchedSpecProject,
} from '@mdx/platform';
import { activeChangeFindings, type ProjectTextReader } from './activeChangeFindings';
import type { ProjectFileSummary } from '../prompt-injection/InjectionChecker';
import { ProjectTextCache } from './ProjectTextCache';
import type { ScannedDocuments } from './SpecProjectChecks';
import { fullPathOf, type ScannedSpecRoot } from './specProjectTree';

/** What the Spec viewer's sidebar shows for the folders of the shown workspace. */
export interface SpecProjectsView {
  /** Undefined while the folders are being scanned. */
  readonly roots: readonly ScannedSpecRoot[] | undefined;
  /** Folders that could not be scanned, by their shown path. */
  readonly unreadableFolders: readonly string[];
  /** The prompt injection findings of each checked document that has any, by its full path. */
  readonly injectionFindings?: ReadonlyMap<string, ProjectFileSummary>;
}

export interface SpecViewerActionsDependencies {
  readonly specProjects: SpecProjectPort;
  /** Called whenever the view changes, so the window can show it. */
  readonly onChange: () => void;
}

interface RootScan {
  readonly folderPath: string;
  readonly scanned?: ScannedSpecRoot;
  /** Every file the scan listed, by its path relative to the folder. */
  readonly paths?: readonly string[];
  /** The linked folders the scan followed, by their paths relative to the folder. */
  readonly followedLinks?: readonly string[];
  /** Reads a file of the scan, again only once its modified time changes. */
  readonly readText?: ProjectTextReader;
  readonly unreadableFolder?: string;
}

/** Scans the folders of a Spec viewer workspace and keeps the sidebar's view of their projects. */
export class SpecViewerActions {
  private current: SpecProjectsView | undefined;
  private shownFolders: readonly string[] = [];
  private scans: readonly RootScan[] = [];
  /** Goes up each time a folder's scan starts, so only the newest scan of a folder is shown. */
  private readonly scanNumbers = new Map<string, number>();
  private readonly texts: ProjectTextCache;
  /** Each watch request waits for the one before, so the folders asked for last are the ones watched. */
  private watching: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: SpecViewerActionsDependencies) {
    this.texts = new ProjectTextCache(dependencies.specProjects);
  }

  /** Scans a folder again whenever the watcher reports a change below it; returns how to stop. */
  start(): () => void {
    return this.dependencies.specProjects.onProjectsChanged((folderPaths) => void this.refresh(folderPaths));
  }

  /** The spec documents and agent instruction files of each scanned folder. */
  scannedDocuments(): ScannedDocuments[] {
    return this.scans.flatMap(({ scanned, paths = [], readText }) =>
      scanned && readText ? [{ root: scanned.root, paths, readText }] : [],
    );
  }

  /** Whether a document is one a scan of the shown folders listed, which agents read as context. */
  holdsDocument(displayPath: string): boolean {
    const key = displayPath.toLowerCase();
    return this.scannedDocuments().some(({ root, paths }) =>
      paths.some((path) => fullPathOf(root, path).toLowerCase() === key),
    );
  }

  view(): SpecProjectsView | undefined {
    return this.current;
  }

  /** Scans the folders again; a newer call wins over one still running. */
  async show(folderPaths: readonly string[]): Promise<void> {
    this.shownFolders = folderPaths;
    this.current = { roots: undefined, unreadableFolders: [] };
    this.scans = [];
    this.dependencies.onChange();
    this.watch(folderPaths.map((root) => ({ root, followedLinks: [] })));
    const scans = await Promise.all(folderPaths.map((folderPath) => this.numberedScanOf(folderPath)));
    if (this.shownFolders !== folderPaths) return;
    this.useScans(scans.map((scan) => scan.scan));
  }

  /** Asks before following a linked folder of a scanned folder, and scans that folder again once the user agrees. */
  async followLink(folderPath: string, linkPath: string): Promise<boolean> {
    const isFollowed = await this.dependencies.specProjects.followLink(folderPath, linkPath);
    if (isFollowed) await this.refresh([folderPath]);
    return isFollowed;
  }

  /** Finds text in the scanned documents that the filter keeps, in every scanned folder. */
  async searchDocuments(
    query: string,
    options: TextSearchOptions,
    filter: SpecSearchFilter,
  ): Promise<FolderSearchResults> {
    const searches = this.scans.flatMap(({ folderPath, paths = [] }) => {
      const searchedPaths = specSearchPathsOf(paths, filter);
      return searchedPaths.length === 0
        ? []
        : [
            this.dependencies.specProjects.searchProjectDocuments(
              { root: folderPath, relativePaths: searchedPaths },
              query,
              options,
            ),
          ];
    });
    const results = await Promise.all(searches);
    return {
      documents: results.flatMap((result) => result.documents),
      isIncomplete: results.some((result) => result.isIncomplete),
    };
  }

  /**
   * Scans shown folders again in place, so the sidebar keeps its open rows, scroll and selection;
   * only files whose modified time changed are read again. With no folders given, every one is.
   */
  async refresh(folderPaths: readonly string[] = this.shownFolders): Promise<void> {
    const shownFolders = this.shownFolders;
    const changed = shownFolders.filter((folderPath) => folderPaths.includes(folderPath));
    if (changed.length === 0 || this.current?.roots === undefined) return;
    const rescans = await Promise.all(changed.map((folderPath) => this.numberedScanOf(folderPath)));
    if (this.shownFolders !== shownFolders) return;
    const newest = new Map(
      rescans
        .filter((rescan) => this.scanNumbers.get(rescan.scan.folderPath) === rescan.number)
        .map((rescan) => [rescan.scan.folderPath, rescan.scan]),
    );
    this.useScans(this.scans.map((scan) => newest.get(scan.folderPath) ?? scan));
  }

  hide(): void {
    this.watch([]);
    this.texts.clear();
    this.shownFolders = [];
    this.scans = [];
    this.current = undefined;
    this.dependencies.onChange();
  }

  private useScans(scans: readonly RootScan[]): void {
    this.scans = scans;
    this.current = {
      roots: scans.flatMap((scan) => scan.scanned ?? []),
      unreadableFolders: scans.flatMap((scan) => scan.unreadableFolder ?? []),
    };
    this.dependencies.onChange();
    this.watch(
      scans.flatMap((scan) =>
        scan.scanned ? [{ root: scan.folderPath, followedLinks: scan.followedLinks ?? [] }] : [],
      ),
    );
  }

  private watch(projects: readonly WatchedSpecProject[]): void {
    const { specProjects } = this.dependencies;
    this.watching = this.watching
      .then(() => specProjects.watchProjects(projects, AGENT_INSTRUCTION_LOCATIONS))
      .catch(() => undefined);
  }

  private async numberedScanOf(
    folderPath: string,
  ): Promise<{ readonly number: number; readonly scan: RootScan }> {
    const number = (this.scanNumbers.get(folderPath) ?? 0) + 1;
    this.scanNumbers.set(folderPath, number);
    return { number, scan: await this.scanRoot(folderPath) };
  }

  private async scanRoot(folderPath: string): Promise<RootScan> {
    try {
      const manifest = await this.dependencies.specProjects.scanProject(
        folderPath,
        AGENT_INSTRUCTION_LOCATIONS,
      );
      const readText = this.texts.readerFor(folderPath, manifest);
      return {
        folderPath,
        scanned: await this.overviewOf(manifest, readText),
        readText,
        paths: manifest.files.map((file) => file.path),
        followedLinks: manifest.links.filter((link) => link.isFollowed).map((link) => link.path),
      };
    } catch {
      return { folderPath, unreadableFolder: folderPath };
    }
  }

  private async overviewOf(
    manifest: SpecProjectManifest,
    readText: ProjectTextReader,
  ): Promise<ScannedSpecRoot> {
    const taskTexts = new Map<string, string>();
    for (const path of activeTaskDocumentsOf(specProjectsOverview(manifest))) {
      const text = await readText(path);
      if (text !== undefined) taskTexts.set(path, text);
    }
    const projects = specProjectsOverview(manifest, taskTexts);
    const findingsByChange = await activeChangeFindings(manifest, projects, readText);
    return { root: manifest.root, isIncomplete: manifest.isIncomplete, projects, findingsByChange };
  }

  /** Reads a file of a scanned folder, such as a delta to preview; undefined when it cannot be read. */
  readProjectText(folderPath: string, relativePath: string): Promise<string | undefined> {
    return this.dependencies.specProjects
      .readProjectFile(folderPath, relativePath)
      .then((document) => document.text)
      .catch(() => undefined);
  }
}
