import type { StoredWorkspace } from '@mdx/platform';
import { formatDate } from '../dates/formatDate';
import { isRecord } from '../session/savedValues';

/** Where a Notes workspace keeps its daily notes, templates and attachments, inside its folder. */
export interface NotesSettings {
  /** A folder inside the location, with `/` between its parts. */
  readonly dailyFolder: string;
  /** How a daily note is named, with `YYYY`, `MM`, `DD` and the other date tokens. */
  readonly dailyNameFormat: string;
  readonly templatesFolder: string;
  /** Where pasted and dropped pictures are saved, inside the location. */
  readonly attachmentsFolder: string;
  /** The name of the template in the templates folder that a new daily note starts from. */
  readonly dailyTemplate?: string;
  /** Folders and notes inside the location that search, backlinks, link suggestions and tags leave out. */
  readonly excludedPaths: readonly string[];
}

export const DEFAULT_NOTES_SETTINGS: NotesSettings = {
  dailyFolder: 'Daily',
  dailyNameFormat: 'YYYY-MM-DD',
  templatesFolder: 'Templates',
  attachmentsFolder: 'Attachments',
  excludedPaths: [],
};

const MAX_SETTING_CHARACTERS = 200;
export const MAX_EXCLUDED_PATHS = 100;
const FORBIDDEN_NAME_CHARACTERS = /[<>:"\\|?*\p{Cc}]/u;

/** The workspace's settings; defaults for any not saved, and for no workspace. */
export function notesSettingsOf(workspace: StoredWorkspace | undefined): NotesSettings {
  const data = workspace?.kindData;
  const saved = isRecord(data) && isRecord(data.settings) ? data.settings : {};
  const dailyTemplate = textOr(saved.dailyTemplate, '');
  return {
    dailyFolder: validFolderOr(saved.dailyFolder, DEFAULT_NOTES_SETTINGS.dailyFolder),
    dailyNameFormat: isValidNameFormat(saved.dailyNameFormat)
      ? saved.dailyNameFormat
      : DEFAULT_NOTES_SETTINGS.dailyNameFormat,
    templatesFolder: validFolderOr(saved.templatesFolder, DEFAULT_NOTES_SETTINGS.templatesFolder),
    attachmentsFolder: validFolderOr(saved.attachmentsFolder, DEFAULT_NOTES_SETTINGS.attachmentsFolder),
    excludedPaths: savedExcludedPaths(saved.excludedPaths),
    ...(isValidNoteName(dailyTemplate) ? { dailyTemplate } : {}),
  };
}

/** The workspace's kind data with these settings in place of its old ones. */
export function kindDataWithNotesSettings(
  kindData: unknown,
  settings: NotesSettings,
): Record<string, unknown> {
  return { ...(isRecord(kindData) ? kindData : {}), settings };
}

/** Today's daily note, by its name; the date is written in the app language. */
export function dailyNoteName(settings: NotesSettings, now: Date, locale: string): string {
  return formatDate(now, settings.dailyNameFormat, locale);
}

/** A folder inside the location: names Windows accepts, with `/` between them, never climbing out. */
export function isValidFolderSetting(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_SETTING_CHARACTERS) return false;
  const parts = value.split('/');
  return value.trim() !== '' && parts.every(isValidNoteName);
}

/** A format whose dates make a name Windows accepts, such as `YYYY-MM-DD` or `dddd D MMMM`. */
export function isValidNameFormat(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_SETTING_CHARACTERS &&
    isValidNoteName(value.replaceAll('/', '\\'))
  );
}

function isValidNoteName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed !== '' &&
    trimmed === name &&
    !name.startsWith('.') &&
    !name.endsWith('.') &&
    !FORBIDDEN_NAME_CHARACTERS.test(name) &&
    !name.includes('/')
  );
}

/**
 * The excluded paths typed one per line, with `/` or `\` between their parts; undefined when a line
 * is not a path inside the location or there are too many.
 */
export function excludedPathsFromLines(text: string): readonly string[] | undefined {
  const paths = text
    .split(/\r?\n/u)
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter((line) => line !== '');
  const unique = [...new Set(paths)];
  return unique.length <= MAX_EXCLUDED_PATHS && unique.every(isValidFolderSetting) ? unique : undefined;
}

function savedExcludedPaths(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidFolderSetting).slice(0, MAX_EXCLUDED_PATHS);
}

function validFolderOr(value: unknown, fallback: string): string {
  return isValidFolderSetting(value) ? value : fallback;
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
