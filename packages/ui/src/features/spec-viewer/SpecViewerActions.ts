import { activeTaskDocumentsOf, AGENT_INSTRUCTION_LOCATIONS, specProjectsOverview } from '@mdx/core';
import type { SpecProjectManifest, SpecProjectPort } from '@mdx/platform';
import type { ScannedSpecRoot } from './specProjectTree';

/** What the Spec viewer's sidebar shows for the folders of the shown workspace. */
export interface SpecProjectsView {
  /** Undefined while the folders are being scanned. */
  readonly roots: readonly ScannedSpecRoot[] | undefined;
  /** Folders that could not be scanned, by their shown path. */
  readonly unreadableFolders: readonly string[];
}

export interface SpecViewerActionsDependencies {
  readonly specProjects: SpecProjectPort;
  /** Called whenever the view changes, so the window can show it. */
  readonly onChange: () => void;
}

interface RootScan {
  readonly scanned?: ScannedSpecRoot;
  readonly unreadableFolder?: string;
}

/** Scans the folders of a Spec viewer workspace and keeps the sidebar's view of their projects. */
export class SpecViewerActions {
  private current: SpecProjectsView | undefined;
  private shownFolders: readonly string[] = [];

  constructor(private readonly dependencies: SpecViewerActionsDependencies) {}

  view(): SpecProjectsView | undefined {
    return this.current;
  }

  /** Scans the folders again; a newer call wins over one still running. */
  async show(folderPaths: readonly string[]): Promise<void> {
    this.shownFolders = folderPaths;
    this.current = { roots: undefined, unreadableFolders: [] };
    this.dependencies.onChange();
    const scans = await Promise.all(folderPaths.map((folderPath) => this.scanRoot(folderPath)));
    if (this.shownFolders !== folderPaths) return;
    this.current = {
      roots: scans.flatMap((scan) => scan.scanned ?? []),
      unreadableFolders: scans.flatMap((scan) => scan.unreadableFolder ?? []),
    };
    this.dependencies.onChange();
  }

  hide(): void {
    this.shownFolders = [];
    this.current = undefined;
    this.dependencies.onChange();
  }

  private async scanRoot(folderPath: string): Promise<RootScan> {
    try {
      const manifest = await this.dependencies.specProjects.scanProject(
        folderPath,
        AGENT_INSTRUCTION_LOCATIONS,
      );
      return { scanned: await this.overviewOf(folderPath, manifest) };
    } catch {
      return { unreadableFolder: folderPath };
    }
  }

  private async overviewOf(folderPath: string, manifest: SpecProjectManifest): Promise<ScannedSpecRoot> {
    const taskDocuments = activeTaskDocumentsOf(specProjectsOverview(manifest));
    const taskTexts = new Map<string, string>();
    await Promise.all(
      taskDocuments.map(async (path) => {
        const document = await this.dependencies.specProjects
          .readProjectFile(folderPath, path)
          .catch(() => undefined);
        if (document) taskTexts.set(path, document.text);
      }),
    );
    return {
      root: manifest.root,
      isIncomplete: manifest.isIncomplete,
      projects: specProjectsOverview(manifest, taskTexts),
    };
  }
}
