import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { FavouritesList } from './FavouritesList';
import { parseFavouritesFile, toFavouritesFile } from './favouritesFile';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

describe('favourites file', () => {
  it('round-trips favourites, labels and groups', () => {
    const favourites = FavouritesList.empty()
      .add(location('C:\\Docs\\Guide.md'), 'file')
      .add(location('\\\\server\\share\\Specs'), 'folder')
      .rename(location('C:\\Docs\\Guide.md').canonicalKey, 'Team guide')
      .createGroup('group-1', 'Work', location('\\\\server\\share\\Specs').canonicalKey);

    const restored = parseFavouritesFile(toFavouritesFile(favourites));

    expect(restored?.favourites()).toEqual(favourites.favourites());
    expect(restored?.groups()).toEqual(favourites.groups());
  });

  it('writes readable JSON that names its format and version', () => {
    const file: unknown = JSON.parse(toFavouritesFile(FavouritesList.empty()));

    expect(file).toEqual({ format: 'mdx-favourites', version: 1, groups: [], favourites: [] });
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['another JSON document', '{"schemaVersion":1,"favourites":[]}'],
    ['a newer version', '{"format":"mdx-favourites","version":2,"favourites":[]}'],
  ])('rejects %s', (_name, text) => {
    expect(parseFavouritesFile(text)).toBeUndefined();
  });

  it('drops invalid entries and keeps the valid ones', () => {
    const text = JSON.stringify({
      format: 'mdx-favourites',
      version: 1,
      groups: [{ id: 'group-1' }],
      favourites: [{ location: location('a.md'), kind: 'file' }, { location: 'C:\\b.md', kind: 'file' }, 7],
    });

    const restored = parseFavouritesFile(text);

    expect(restored?.favourites().map((favourite) => favourite.location.fileName)).toEqual(['a.md']);
    expect(restored?.groups()).toEqual([]);
  });
});
