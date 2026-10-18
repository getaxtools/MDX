import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { displayNameOf, FavouritesList } from './FavouritesList';

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
