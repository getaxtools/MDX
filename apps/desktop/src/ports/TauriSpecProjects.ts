import type { OpenedDocument, SpecProjectManifest, SpecProjectPort } from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { tauriCommands } from './tauriCommands';

export class TauriSpecProjects implements SpecProjectPort {
  async scanProject(root: string, additionalLocations: readonly string[]): Promise<SpecProjectManifest> {
    try {
      return await tauriCommands.scanSpecProject(root, additionalLocations);
    } catch (error) {
      throw documentOpenErrorOf(error, root);
    }
  }

  async readProjectFile(root: string, relativePath: string): Promise<OpenedDocument> {
    try {
      return await tauriCommands.readSpecProjectFile(root, relativePath);
    } catch (error) {
      throw documentOpenErrorOf(error, relativePath);
    }
  }
}
