import type { DocumentLinksPort } from '../DocumentLinksPort';
import { DocumentOpenError } from '../DocumentOpenError';

/** Resolves links by joining them to the document's folder with backslashes, like Windows paths. */
export class InMemoryDocumentLinks implements DocumentLinksPort {
  readonly openedExternalLinks: string[] = [];

  resolveDocumentLink(documentPath: string, href: string): Promise<string> {
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
