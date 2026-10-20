import type { DocumentLocation, FolderListing, FolderPort } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriFolders implements FolderPort {
  async pickFolder(): Promise<DocumentLocation | undefined> {
    return (await tauriCommands.pickFolder()) ?? undefined;
  }

  listFolderContents(folderPath: string): Promise<FolderListing> {
    return tauriCommands.listFolderContents(folderPath);
  }

  findDocuments(folderPaths: readonly string[]): Promise<DocumentLocation[]> {
    return tauriCommands.findFolderDocuments(folderPaths);
  }
}
