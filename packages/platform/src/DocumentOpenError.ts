export type DocumentOpenFailure =
  'notFound' | 'unreachable' | 'tooLarge' | 'notMarkdown' | 'accessDenied' | 'unreadable' | 'invalidRequest';

const DOCUMENT_OPEN_FAILURES: readonly string[] = [
  'notFound',
  'unreachable',
  'tooLarge',
  'notMarkdown',
  'accessDenied',
  'unreadable',
  'invalidRequest',
];

export function isDocumentOpenFailure(value: unknown): value is DocumentOpenFailure {
  return typeof value === 'string' && DOCUMENT_OPEN_FAILURES.includes(value);
}

export class DocumentOpenError extends Error {
  constructor(
    readonly failure: DocumentOpenFailure,
    readonly path: string,
  ) {
    super(`Could not open ${path}: ${failure}`);
    this.name = 'DocumentOpenError';
  }

  get messageKey(): `errors.document.${DocumentOpenFailure}` {
    return `errors.document.${this.failure}`;
  }
}
