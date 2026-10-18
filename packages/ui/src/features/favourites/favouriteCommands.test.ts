import { FavouritesList, displayNameOf } from '@mdx/core';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { applyFavouriteCommand, isFavouriteCommand } from './favouriteCommands';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const keyOf = (path: string) => location(path).canonicalKey;
const favourites = FavouritesList.empty().add(location('a.md'), 'file').add(location('b.md'), 'file');
const namesOf = (list: FavouritesList) => list.favourites().map(displayNameOf);

describe('favourite commands', () => {
  it('removes, renames and moves favourites', () => {
    expect(
      namesOf(applyFavouriteCommand(favourites, { kind: 'removeFavourite', canonicalKey: keyOf('a.md') })),
    ).toEqual(['b.md']);
    expect(
      namesOf(
        applyFavouriteCommand(favourites, {
          kind: 'renameFavourite',
          canonicalKey: keyOf('a.md'),
          label: 'Spec',
        }),
      ),
    ).toEqual(['Spec', 'b.md']);
    expect(
      namesOf(
        applyFavouriteCommand(favourites, { kind: 'moveFavourite', canonicalKey: keyOf('b.md'), toIndex: 0 }),
      ),
    ).toEqual(['b.md', 'a.md']);
  });

  it('tells favourite commands apart from other commands', () => {
    expect(isFavouriteCommand({ kind: 'renameFavourite' })).toBe(true);
    expect(isFavouriteCommand({ kind: 'pinTab' })).toBe(false);
  });
});
