import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { displayNameOf, FavouritesList, nextFavouriteGroupId } from './FavouritesList';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const namesOf = (list: FavouritesList) => list.favourites().map(displayNameOf);

describe('FavouritesList', () => {
  it('adds files and folders in the order they were starred', () => {
    const favourites = FavouritesList.empty()
      .add(location('C:\\Docs\\Guide.md'), 'file')
      .add(location('\\\\server\\share\\Specs'), 'folder');

    expect(namesOf(favourites)).toEqual(['Guide.md', 'Specs']);
    expect(favourites.favourites().map((favourite) => favourite.kind)).toEqual(['file', 'folder']);
  });

  it('ignores a second star for the same document spelled differently', () => {
    const favourites = FavouritesList.empty()
      .add(location('C:\\Docs\\Guide.md'), 'file')
      .add(location('c:\\docs\\GUIDE.md'), 'file');

    expect(favourites.favourites()).toHaveLength(1);
  });

  it('toggles a favourite on and off', () => {
    const guide = location('Guide.md');

    const starred = FavouritesList.empty().toggle(guide, 'file');
    const unstarred = starred.toggle(guide, 'file');

    expect(starred.isFavourite(guide.canonicalKey)).toBe(true);
    expect(unstarred.isFavourite(guide.canonicalKey)).toBe(false);
  });

  it('shows a custom label instead of the file name', () => {
    const guide = location('Guide.md');

    const favourites = FavouritesList.empty().add(guide, 'file').rename(guide.canonicalKey, '  Team guide  ');

    expect(namesOf(favourites)).toEqual(['Team guide']);
  });

  it('falls back to the file name when the label is cleared', () => {
    const guide = location('Guide.md');

    const favourites = FavouritesList.empty()
      .add(guide, 'file')
      .rename(guide.canonicalKey, 'Team guide')
      .rename(guide.canonicalKey, '   ');

    expect(namesOf(favourites)).toEqual(['Guide.md']);
    expect(favourites.favourites()[0]).not.toHaveProperty('label');
  });

  it('moves a favourite to a new position', () => {
    const favourites = ['a.md', 'b.md', 'c.md'].reduce(
      (list, path) => list.add(location(path), 'file'),
      FavouritesList.empty(),
    );

    const reordered = favourites.move(location('c.md').canonicalKey, 0);

    expect(namesOf(reordered)).toEqual(['c.md', 'a.md', 'b.md']);
  });

  it('clamps a move beyond the end of the list', () => {
    const favourites = FavouritesList.empty().add(location('a.md'), 'file').add(location('b.md'), 'file');

    const reordered = favourites.move(location('a.md').canonicalKey, 99);

    expect(namesOf(reordered)).toEqual(['b.md', 'a.md']);
  });

  it('leaves the list unchanged when moving an unknown favourite', () => {
    const favourites = FavouritesList.empty().add(location('a.md'), 'file');

    expect(favourites.move('unknown', 0)).toBe(favourites);
  });

  it('removes a favourite', () => {
    const favourites = FavouritesList.empty()
      .add(location('a.md'), 'file')
      .add(location('b.md'), 'file')
      .remove(location('a.md').canonicalKey);

    expect(namesOf(favourites)).toEqual(['b.md']);
  });

  it('restores saved favourites and drops duplicates', () => {
    const favourites = FavouritesList.fromFavourites([
      { location: location('a.md'), kind: 'file', label: 'Alpha' },
      { location: location('A.md'), kind: 'file' },
    ]);

    expect(namesOf(favourites)).toEqual(['Alpha']);
  });
});

describe('relocating favourites', () => {
  it('points a favourite at the file’s new place, keeping its label and position', () => {
    const favourites = FavouritesList.empty()
      .add(location('old/a.md'), 'file')
      .add(location('b.md'), 'file')
      .rename(location('old/a.md').canonicalKey, 'Alpha');

    const relocated = favourites.relocate(location('old/a.md').canonicalKey, location('new/a.md'));

    expect(
      relocated.favourites().map((favourite) => [favourite.location.displayPath, favourite.label]),
    ).toEqual([
      ['new/a.md', 'Alpha'],
      ['b.md', undefined],
    ]);
  });

  it('drops the old favourite when the located file is already a favourite', () => {
    const favourites = FavouritesList.empty()
      .add(location('old/a.md'), 'file')
      .add(location('new/a.md'), 'file');

    const relocated = favourites.relocate(location('old/a.md').canonicalKey, location('new/a.md'));

    expect(namesOf(relocated)).toEqual(['a.md']);
    expect(relocated.favourites()[0]?.location.displayPath).toBe('new/a.md');
  });
});

describe('favourite groups', () => {
  const keyOf = (path: string) => location(path).canonicalKey;
  const starred = () =>
    FavouritesList.empty()
      .add(location('a.md'), 'file')
      .add(location('b.md'), 'file')
      .add(location('c.md'), 'file');
  const groupNamesOf = (list: FavouritesList) => list.groups().map((group) => group.name);

  it('creates a group and moves favourites into it', () => {
    const favourites = starred().createGroup('group-1', ' Specs ').moveToGroup(keyOf('b.md'), 'group-1');

    expect(groupNamesOf(favourites)).toEqual(['Specs']);
    expect(favourites.favouritesInGroup('group-1').map(displayNameOf)).toEqual(['b.md']);
    expect(favourites.favouritesInGroup(undefined).map(displayNameOf)).toEqual(['a.md', 'c.md']);
  });

  it('creates a group around a favourite in one step', () => {
    const favourites = starred().createGroup('group-1', 'Specs', keyOf('c.md'));

    expect(favourites.favouritesInGroup('group-1').map(displayNameOf)).toEqual(['c.md']);
  });

  it('moves a favourite from one group to another and out of every group', () => {
    const grouped = starred().createGroup('group-1', 'Specs', keyOf('a.md')).createGroup('group-2', 'Notes');

    const moved = grouped.moveToGroup(keyOf('a.md'), 'group-2');
    const ungrouped = moved.moveToGroup(keyOf('a.md'), undefined);

    expect(moved.favouritesInGroup('group-2').map(displayNameOf)).toEqual(['a.md']);
    expect(ungrouped.favouritesInGroup(undefined).map(displayNameOf)).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('renames a group and ignores an empty name', () => {
    const favourites = starred().createGroup('group-1', 'Specs');

    expect(groupNamesOf(favourites.renameGroup('group-1', 'Design'))).toEqual(['Design']);
    expect(groupNamesOf(favourites.renameGroup('group-1', '  '))).toEqual(['Specs']);
  });

  it('keeps the favourites of a removed group', () => {
    const favourites = starred().createGroup('group-1', 'Specs', keyOf('b.md')).removeGroup('group-1');

    expect(favourites.groups()).toEqual([]);
    expect(favourites.favouritesInGroup(undefined)).toHaveLength(3);
  });

  it('keeps the group when a favourite is renamed or its label cleared', () => {
    const favourites = starred()
      .createGroup('group-1', 'Specs', keyOf('a.md'))
      .rename(keyOf('a.md'), 'Alpha')
      .rename(keyOf('a.md'), '');

    expect(favourites.favouritesInGroup('group-1').map(displayNameOf)).toEqual(['a.md']);
  });

  it('ignores moves into a group that does not exist and duplicate group ids', () => {
    const favourites = starred().createGroup('group-1', 'Specs');

    expect(favourites.moveToGroup(keyOf('a.md'), 'group-9')).toBe(favourites);
    expect(favourites.createGroup('group-1', 'Other')).toBe(favourites);
  });

  it('picks a new group id after the highest existing one', () => {
    expect(nextFavouriteGroupId([])).toBe('group-1');
    expect(
      nextFavouriteGroupId([
        { id: 'group-2', name: 'A' },
        { id: 'group-7', name: 'B' },
      ]),
    ).toBe('group-8');
  });

  it('restores favourites without a group when their group is missing', () => {
    const favourites = FavouritesList.fromFavourites([
      { location: location('a.md'), kind: 'file', groupId: 'gone' },
    ]);

    expect(favourites.favouritesInGroup(undefined).map(displayNameOf)).toEqual(['a.md']);
  });

  it('merges another list, matching groups by name and skipping favourites it already has', () => {
    const mine = starred().createGroup('group-1', 'Specs', keyOf('a.md'));
    const theirs = FavouritesList.empty()
      .add(location('a.md'), 'file')
      .add(location('d.md'), 'file')
      .add(location('e.md'), 'file')
      .createGroup('group-5', 'Specs', keyOf('d.md'))
      .createGroup('group-6', 'Archive', keyOf('e.md'));

    const merged = mine.merge(theirs);

    expect(namesOf(merged)).toEqual(['a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
    expect(groupNamesOf(merged)).toEqual(['Specs', 'Archive']);
    expect(merged.favouritesInGroup('group-1').map(displayNameOf)).toEqual(['a.md', 'd.md']);
    expect(merged.favouritesInGroup('group-2').map(displayNameOf)).toEqual(['e.md']);
  });
});
