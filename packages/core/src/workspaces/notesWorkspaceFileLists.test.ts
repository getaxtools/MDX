import { describe, expect, it } from 'vitest';
import type { PortableWorkspace } from './workspaceFile';
import { notesWorkspaceFileLists } from './notesWorkspaceFileLists';
import { locationOfPath } from './windowsPaths';

const NEW_NOTES_FOLDER = locationOfPath('C:\\Users\\Ana\\Documents\\MDX Notes');

function journalFile(overrides: Partial<PortableWorkspace> = {}): PortableWorkspace {
  return {
    name: 'Journal',
    kindId: 'notes',
    icon: null,
    colour: null,
    roots: [locationOfPath('D:\\team\\Old Notes'), locationOfPath('D:\\team\\References')],
    favourites: [],
    favouriteGroups: [],
    settingsOverrides: {},
    ...overrides,
  };
}

describe('notesWorkspaceFileLists', () => {
  it('the chosen folder replaces the old notes folder and other roots stay', () => {
    const { explorerFolders } = notesWorkspaceFileLists(journalFile(), NEW_NOTES_FOLDER);

    expect(explorerFolders.map((folder) => folder.displayPath)).toEqual([
      'C:\\Users\\Ana\\Documents\\MDX Notes',
      'D:\\team\\References',
    ]);
  });

  it('favourites inside the old notes folder move to the chosen folder', () => {
    const file = journalFile({
      favourites: [
        { location: locationOfPath('D:\\team\\OLD NOTES\\Projects\\Plan.md'), kind: 'file' },
        { location: locationOfPath('D:\\team\\Old Notes'), kind: 'folder', label: 'All notes' },
      ],
    });

    const { favourites } = notesWorkspaceFileLists(file, NEW_NOTES_FOLDER);

    expect(favourites).toEqual([
      { location: locationOfPath('C:\\Users\\Ana\\Documents\\MDX Notes\\Projects\\Plan.md'), kind: 'file' },
      { location: NEW_NOTES_FOLDER, kind: 'folder', label: 'All notes' },
    ]);
  });

  it('favourites outside the old notes folder are kept as they are', () => {
    const outside = {
      location: locationOfPath('D:\\team\\Old Notes Archive\\2024.md'),
      kind: 'file',
    } as const;

    const { favourites } = notesWorkspaceFileLists(journalFile({ favourites: [outside] }), NEW_NOTES_FOLDER);

    expect(favourites).toEqual([outside]);
  });

  it('a file without roots keeps its favourites and shows the chosen folder', () => {
    const favourite = { location: locationOfPath('D:\\team\\Guide.md'), kind: 'file' } as const;

    const lists = notesWorkspaceFileLists(
      journalFile({ roots: [], favourites: [favourite] }),
      NEW_NOTES_FOLDER,
    );

    expect(lists.explorerFolders).toEqual([NEW_NOTES_FOLDER]);
    expect(lists.favourites).toEqual([favourite]);
  });
});
