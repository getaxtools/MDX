import { listen } from '@tauri-apps/api/event';
import type { DocumentRequestListener, DocumentRequestsPort } from '@mdx/platform';
import { OPEN_DOCUMENTS_EVENT, tauriCommands } from './tauriCommands';

export class TauriDocumentRequests implements DocumentRequestsPort {
  pickDocuments(): Promise<readonly string[]> {
    return tauriCommands.pickDocuments();
  }

  takeStartupDocuments(): Promise<readonly string[]> {
    return tauriCommands.takeStartupDocuments();
  }

  onDocumentsRequested(listener: DocumentRequestListener): () => void {
    const stopListening = listen<string[]>(OPEN_DOCUMENTS_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }
}
