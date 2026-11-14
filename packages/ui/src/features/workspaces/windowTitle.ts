import type { Translator } from '@mdx/i18n';

export interface WindowTitleParts {
  readonly documentName?: string | undefined;
  /** Absent while the earlier state file stands in for the workspace store. */
  readonly workspaceName?: string | undefined;
}

/** "guide.md - Handbook - MDX": the document, then the workspace, then the app, as Windows titles read. */
export function windowTitleFor(
  { documentName, workspaceName }: WindowTitleParts,
  translator: Translator,
): string {
  const app = translator.translate('app.shortName');
  const names = [documentName, workspaceName].filter(
    (name): name is string => name !== undefined && name !== '',
  );
  if (names.length === 0) return translator.translate('app.name');
  return translator.translate('window.title', { names: names.join(' - '), app });
}
