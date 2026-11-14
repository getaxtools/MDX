import type { StoredWorkspace } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import {
  claimedNotesLocations,
  defaultNotesLocationPath,
  isSyncedFolder,
  locationClaimProblem,
  notesKindData,
  notesLocationOf,
} from './notesLocation';

const DOCUMENTS = 'C:\\Users\\Ana\\Documents';

function notesWorkspace(id: string, path: string): StoredWorkspace {
  return {
    id,
    kindId: 'notes',
    name: id,
    icon: null,
    colour: null,
    position: 0,
    lastShownAtMs: null,
    kindData: notesKindData({ path, canonicalKey: path.toLowerCase(), locationId: `${id}-location` }),
  };
}

describe('Notes location', () => {
  it('Documents follows a redirected path', () => {
    expect(
      defaultNotesLocationPath('D:\\Redirected\\Documents\\', {
        workspaceName: 'Notes',
        isFirstNotesWorkspace: true,
      }),
    ).toBe('D:\\Redirected\\Documents\\MDX Notes');
  });

  it('suggests MDX Notes - Work for a workspace named Work', () => {
    expect(defaultNotesLocationPath(DOCUMENTS, { workspaceName: 'Work', isFirstNotesWorkspace: false })).toBe(
      'C:\\Users\\Ana\\Documents\\MDX Notes - Work',
    );
  });

  it('keeps a default folder name Windows accepts', () => {
    expect(
      defaultNotesLocationPath(DOCUMENTS, { workspaceName: 'R&D: plans?', isFirstNotesWorkspace: false }),
    ).toBe('C:\\Users\\Ana\\Documents\\MDX Notes - R&D  plans');
  });

  it('a path under the OneDrive folder is reported as synced', () => {
    const synced = ['C:\\Users\\Ana\\OneDrive'];

    expect(isSyncedFolder('C:\\Users\\Ana\\OneDrive\\Documents\\MDX Notes', synced)).toBe(true);
    expect(isSyncedFolder('c:\\users\\ana\\onedrive', synced)).toBe(true);
  });

  it('a local path is not', () => {
    const synced = ['C:\\Users\\Ana\\OneDrive'];

    expect(isSyncedFolder('C:\\Users\\Ana\\Documents\\MDX Notes', synced)).toBe(false);
    expect(isSyncedFolder('C:\\Users\\Ana\\OneDrive2\\MDX Notes', synced)).toBe(false);
  });

  it('a claimed folder is refused', () => {
    expect(locationClaimProblem('C:\\Notes', ['C:\\Notes'])).toBe('claimed');
  });

  it('a folder inside a location is refused', () => {
    expect(locationClaimProblem('C:\\Notes\\Inner', ['C:\\Notes'])).toBe('insideLocation');
  });

  it('a folder containing a location is refused', () => {
    expect(locationClaimProblem('C:\\', ['C:\\Notes'])).toBe('containsLocation');
    expect(locationClaimProblem('C:\\Work', ['C:\\Work\\Notes'])).toBe('containsLocation');
  });

  it('case and separators compare by canonical key', () => {
    expect(locationClaimProblem('c:/NOTES/', ['C:\\Notes'])).toBe('claimed');
    expect(locationClaimProblem('C:\\Notes2', ['C:\\Notes'])).toBeUndefined();
  });

  it('lists the folders other Notes workspaces claimed', () => {
    const workspaces = [notesWorkspace('journal', 'C:\\Journal'), notesWorkspace('work', 'D:\\Work')];

    expect(claimedNotesLocations(workspaces, 'work')).toEqual(['C:\\Journal']);
  });

  it('reads a location from kind data and ignores anything else', () => {
    expect(notesLocationOf(notesWorkspace('journal', 'C:\\Journal'))?.locationId).toBe('journal-location');
    expect(
      notesLocationOf({ ...notesWorkspace('journal', 'C:\\Journal'), kindData: { location: 'C:\\x' } }),
    ).toBe(undefined);
  });
});
