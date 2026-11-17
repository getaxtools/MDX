import type { FoldersChangedListener, FolderWatcherPort } from '@mdx/platform';
import { FOLDERS_CHANGED_EVENT, tauriCommands } from './tauriCommands';
import { listenInThisWindow } from './windowEvents';

export class TauriFolderWatcher implements FolderWatcherPort {
  async watch(folderPaths: readonly string[]): Promise<void> {
    await tauriCommands.watchFolders(folderPaths);
  }

  onFoldersChanged(listener: FoldersChangedListener): () => void {
    return listenInThisWindow<string[]>(FOLDERS_CHANGED_EVENT, (event) => listener(event.payload));
  }
}
