import { listen } from '@tauri-apps/api/event';
import type {
  FolderSearchResults,
  ProjectDocuments,
  OpenedDocument,
  SpecProjectManifest,
  SpecProjectPort,
  SpecProjectsChangedListener,
  TextSearchOptions,
  WatchedSpecProject,
} from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { SPEC_PROJECTS_CHANGED_EVENT, tauriCommands } from './tauriCommands';

export class TauriSpecProjects implements SpecProjectPort {
  async scanProject(root: string, additionalLocations: readonly string[]): Promise<SpecProjectManifest> {
    try {
      return await tauriCommands.scanSpecProject(root, additionalLocations);
    } catch (error) {
      throw documentOpenErrorOf(error, root);
    }
  }

  async followLink(root: string, linkPath: string): Promise<boolean> {
    try {
      return await tauriCommands.followSpecProjectLink(root, linkPath);
    } catch (error) {
      throw documentOpenErrorOf(error, linkPath);
    }
  }

  searchProjectDocuments(
    documents: ProjectDocuments,
    query: string,
    options: TextSearchOptions,
  ): Promise<FolderSearchResults> {
    return tauriCommands.searchSpecProjectDocuments(documents, query, options);
  }

  async watchProjects(
    projects: readonly WatchedSpecProject[],
    additionalLocations: readonly string[],
  ): Promise<void> {
    await tauriCommands.watchSpecProjects(projects, additionalLocations);
  }

  onProjectsChanged(listener: SpecProjectsChangedListener): () => void {
    const stopListening = listen<string[]>(SPEC_PROJECTS_CHANGED_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }

  async readProjectFile(root: string, relativePath: string): Promise<OpenedDocument> {
    try {
      return await tauriCommands.readSpecProjectFile(root, relativePath);
    } catch (error) {
      throw documentOpenErrorOf(error, relativePath);
    }
  }
}
