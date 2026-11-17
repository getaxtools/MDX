import type { DocumentsChangedListener, DocumentWatcherPort } from '@mdx/platform';
import { DOCUMENTS_CHANGED_EVENT, tauriCommands } from './tauriCommands';
import { listenInThisWindow } from './windowEvents';

export class TauriDocumentWatcher implements DocumentWatcherPort {
  async watch(displayPaths: readonly string[]): Promise<void> {
    await tauriCommands.watchDocuments(displayPaths);
  }

  onDocumentsChanged(listener: DocumentsChangedListener): () => void {
    return listenInThisWindow<string[]>(DOCUMENTS_CHANGED_EVENT, (event) => listener(event.payload));
  }
}
