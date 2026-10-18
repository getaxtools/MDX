import type { DocumentLocation, FolderPort } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriFolders implements FolderPort {
  async pickFolder(): Promise<DocumentLocation | undefined> {
    return (await tauriCommands.pickFolder()) ?? undefined;
  }

  listFolderDocuments(folderPath: string): Promise<readonly DocumentLocation[]> {
    return tauriCommands.listFolderDocuments(folderPath);
  }
}
