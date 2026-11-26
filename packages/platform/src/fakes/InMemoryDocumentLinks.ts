import type { DocumentLinksPort, InspectedLink } from '../DocumentLinksPort';
import { DocumentOpenError } from '../DocumentOpenError';

/** Resolves links by joining them to the document's folder with backslashes, like Windows paths. */
export class InMemoryDocumentLinks implements DocumentLinksPort {
  readonly openedExternalLinks: string[] = [];
  /** Folders the app may not read yet; a link into one is reported as not granted. */
  ungrantedFolders: readonly string[] = [];

  async resolveDocumentLink(documentPath: string, href: string, expectedTarget?: string): Promise<string> {
    const path = await this.linkedPathOf(documentPath, href);
    if (expectedTarget !== undefined && expectedTarget !== path) {
      throw new DocumentOpenError('invalidRequest', href);
    }
    return path;
  }

  async inspectDocumentLink(documentPath: string, href: string): Promise<InspectedLink> {
    const path = await this.linkedPathOf(documentPath, href);
    const key = path.toLowerCase();
    const isGranted = !this.ungrantedFolders.some((folder) => key.startsWith(`${folder.toLowerCase()}\\`));
    return { path, isGranted };
  }

  private linkedPathOf(documentPath: string, href: string): Promise<string> {
    const relativePath = decodeURIComponent(href.split(/[?#]/)[0] ?? '');
    if (!/\.(md|markdown)$/i.test(relativePath))
      return Promise.reject(new DocumentOpenError('notMarkdown', href));
    const folder = documentPath.slice(0, documentPath.lastIndexOf('\\'));
    return Promise.resolve(`${folder}\\${relativePath.replaceAll('/', '\\')}`);
  }

  openExternalLink(url: string): Promise<void> {
    this.openedExternalLinks.push(url);
    return Promise.resolve();
  }
}
