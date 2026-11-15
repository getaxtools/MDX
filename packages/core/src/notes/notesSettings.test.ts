import type { StoredWorkspace } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTES_SETTINGS,
  dailyNoteName,
  excludedPathsFromLines,
  isValidFolderSetting,
  isValidNameFormat,
  kindDataWithNotesSettings,
  notesSettingsOf,
} from './notesSettings';

function workspaceWith(kindData: unknown): StoredWorkspace {
  return {
    id: 'journal',
    kindId: 'notes',
    name: 'Journal',
    icon: null,
    colour: null,
    position: 0,
    lastShownAtMs: 0,
    kindData,
  };
}

const THURSDAY = new Date(2026, 10, 12, 9, 5);

describe('notes settings', () => {
  it('a workspace without settings uses Daily, YYYY-MM-DD and Templates', () => {
    expect(notesSettingsOf(workspaceWith({ location: {} }))).toEqual(DEFAULT_NOTES_SETTINGS);
  });

  it('keeps saved settings next to the location', () => {
    const location = { path: 'E:\\Journal', canonicalKey: 'e:\\journal', locationId: 'one' };
    const settings = {
      dailyFolder: 'Journal/Days',
      dailyNameFormat: 'dddd D MMMM',
      templatesFolder: 'Meta',
      dailyTemplate: 'Day',
      excludedPaths: ['Private', 'Journal/Diary.md'],
    };

    const kindData = kindDataWithNotesSettings({ location }, settings);

    expect(kindData.location).toEqual(location);
    expect(notesSettingsOf(workspaceWith(kindData))).toEqual(settings);
  });

  it('settings that would leave the folder or that Windows cannot name fall back to the defaults', () => {
    const settings = notesSettingsOf(
      workspaceWith({
        settings: {
          dailyFolder: '../Outside',
          dailyNameFormat: 'YYYY:MM',
          templatesFolder: '.hidden',
          excludedPaths: '../Outside',
        },
      }),
    );

    expect(settings).toEqual(DEFAULT_NOTES_SETTINGS);
  });

  it('names the daily note by its format in the app language', () => {
    expect(dailyNoteName(DEFAULT_NOTES_SETTINGS, THURSDAY, 'en')).toBe('2026-11-12');
    expect(dailyNoteName({ ...DEFAULT_NOTES_SETTINGS, dailyNameFormat: 'dddd D MMMM' }, THURSDAY, 'en')).toBe(
      'Thursday 12 November',
    );
  });

  it('checks folders and formats as they are typed', () => {
    expect(isValidFolderSetting('Journal/Days')).toBe(true);
    expect(isValidFolderSetting('Journal//Days')).toBe(false);
    expect(isValidFolderSetting('C:\\Days')).toBe(false);
    expect(isValidNameFormat('YYYY-MM-DD')).toBe(true);
    expect(isValidNameFormat('YYYY/MM/DD')).toBe(false);
  });

  it('excluded paths are read one per line, with either slash', () => {
    expect(excludedPathsFromLines('Private\n\n  Work\\Reviews  \nPrivate\n')).toEqual([
      'Private',
      'Work/Reviews',
    ]);
    expect(excludedPathsFromLines('')).toEqual([]);
  });

  it('an excluded path outside the folder refuses the whole list', () => {
    expect(excludedPathsFromLines('Private\n../Outside')).toBeUndefined();
    expect(excludedPathsFromLines('C:\\Users')).toBeUndefined();
  });

  it('saved excluded paths that would leave the folder are dropped', () => {
    const settings = notesSettingsOf(
      workspaceWith({ settings: { excludedPaths: ['Private', '../Outside', 7] } }),
    );

    expect(settings.excludedPaths).toEqual(['Private']);
  });
});
