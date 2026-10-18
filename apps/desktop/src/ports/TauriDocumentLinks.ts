import type { DocumentLinksPort } from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { tauriCommands } from './tauriCommands';

export class TauriDocumentLinks implements DocumentLinksPort {
  async resolveDocumentLink(documentPath: string, href: string): Promise<string> {
    try {
      return await tauriCommands.resolveDocumentLink(documentPath, href);
    } catch (error) {
      throw documentOpenErrorOf(error, href);
    }
  }

  async openExternalLink(url: string): Promise<void> {
    await tauriCommands.openExternalLink(url);
  }
}
