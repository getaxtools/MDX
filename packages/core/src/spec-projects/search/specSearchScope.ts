import { isAgentInstructionFile } from '../agent-files/agentInstructionLocations';

export const SPEC_SEARCH_SCOPES = ['all', 'specs', 'changes', 'tasks', 'instructions'] as const;
export type SpecSearchScope = (typeof SPEC_SEARCH_SCOPES)[number];

/** Which documents of the scanned spec projects a search reads. */
export interface SpecSearchFilter {
  readonly scope: SpecSearchScope;
  /** Archived changes are left out unless the user includes them. */
  readonly isArchiveIncluded: boolean;
}

export const DEFAULT_SPEC_SEARCH_FILTER: SpecSearchFilter = { scope: 'all', isArchiveIncluded: false };

const MARKDOWN_FILE = /\.(?:md|markdown|mdc)$/i;
const CHANGE_FOLDER = /(?:^|\/)changes\//i;
const ARCHIVE_FOLDER = /(?:^|\/)changes\/archive\//i;
const TASKS_FILE = /(?:^|\/)tasks\.md$/i;

/** A project can sit in a subfolder of the scanned folder, so its instruction files are one level down. */
function isInstructionFile(path: string): boolean {
  const slash = path.indexOf('/');
  return isAgentInstructionFile(path) || (slash > 0 && isAgentInstructionFile(path.slice(slash + 1)));
}

function isInScope(path: string, scope: SpecSearchScope): boolean {
  if (scope === 'changes') return CHANGE_FOLDER.test(path);
  if (scope === 'tasks') return TASKS_FILE.test(path);
  if (scope === 'instructions') return isInstructionFile(path);
  if (scope === 'specs') {
    return !CHANGE_FOLDER.test(path) && !TASKS_FILE.test(path) && !isInstructionFile(path);
  }
  return true;
}

/** The scanned Markdown documents a spec search reads, by their paths relative to the scanned folder. */
export function specSearchPathsOf(paths: readonly string[], filter: SpecSearchFilter): string[] {
  return paths.filter(
    (path) =>
      MARKDOWN_FILE.test(path) &&
      (filter.isArchiveIncluded || !ARCHIVE_FOLDER.test(path)) &&
      isInScope(path, filter.scope),
  );
}
