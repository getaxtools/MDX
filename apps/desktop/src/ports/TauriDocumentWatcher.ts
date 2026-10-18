import { listen } from '@tauri-apps/api/event';
import type { DocumentsChangedListener, DocumentWatcherPort } from '@mdx/platform';
import { DOCUMENTS_CHANGED_EVENT, tauriCommands } from './tauriCommands';

export class TauriDocumentWatcher implements DocumentWatcherPort {
  async watch(displayPaths: readonly string[]): Promise<void> {
    await tauriCommands.watchDocuments(displayPaths);
  }

  onDocumentsChanged(listener: DocumentsChangedListener): () => void {
    const stopListening = listen<string[]>(DOCUMENTS_CHANGED_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }
}
