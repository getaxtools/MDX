import type { DocumentRequestListener, DocumentRequestsPort } from '@mdx/platform';
import { OPEN_DOCUMENTS_EVENT, tauriCommands } from './tauriCommands';
import { listenInThisWindow } from './windowEvents';

export class TauriDocumentRequests implements DocumentRequestsPort {
  pickDocuments(): Promise<readonly string[]> {
    return tauriCommands.pickDocuments();
  }

  takeStartupDocuments(): Promise<readonly string[]> {
    return tauriCommands.takeStartupDocuments();
  }

  onDocumentsRequested(listener: DocumentRequestListener): () => void {
    return listenInThisWindow<string[]>(OPEN_DOCUMENTS_EVENT, (event) => listener(event.payload));
  }
}
