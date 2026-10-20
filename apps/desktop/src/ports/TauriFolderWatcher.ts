import { listen } from '@tauri-apps/api/event';
import type { FoldersChangedListener, FolderWatcherPort } from '@mdx/platform';
import { FOLDERS_CHANGED_EVENT, tauriCommands } from './tauriCommands';

export class TauriFolderWatcher implements FolderWatcherPort {
  async watch(folderPaths: readonly string[]): Promise<void> {
    await tauriCommands.watchFolders(folderPaths);
  }

  onFoldersChanged(listener: FoldersChangedListener): () => void {
    const stopListening = listen<string[]>(FOLDERS_CHANGED_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }
}
