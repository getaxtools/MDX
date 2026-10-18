import { DocumentOpenError, isDocumentOpenFailure } from '@mdx/platform';

/** Turns an error code sent by the app's backend into a typed error with a message key. */
export function documentOpenErrorOf(error: unknown, path: string): DocumentOpenError {
  const code: unknown =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return new DocumentOpenError(isDocumentOpenFailure(code) ? code : 'unreadable', path);
}
