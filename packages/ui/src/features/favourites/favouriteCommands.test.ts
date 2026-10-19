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

  it('creates, renames and removes groups and moves favourites between them', () => {
    const grouped = applyFavouriteCommand(favourites, {
      kind: 'createFavouriteGroup',
      groupId: 'group-1',
      name: 'Specs',
      canonicalKey: keyOf('a.md'),
    });
    const renamed = applyFavouriteCommand(grouped, {
      kind: 'renameFavouriteGroup',
      groupId: 'group-1',
      name: 'Docs',
    });
    const moved = applyFavouriteCommand(renamed, {
      kind: 'moveFavouriteToGroup',
      canonicalKey: keyOf('b.md'),
      groupId: 'group-1',
    });
    const ungrouped = applyFavouriteCommand(moved, {
      kind: 'moveFavouriteToGroup',
      canonicalKey: keyOf('a.md'),
    });
    const removed = applyFavouriteCommand(ungrouped, { kind: 'removeFavouriteGroup', groupId: 'group-1' });

    expect(renamed.groups()).toEqual([{ id: 'group-1', name: 'Docs' }]);
    expect(moved.favouritesInGroup('group-1').map(displayNameOf)).toEqual(['a.md', 'b.md']);
    expect(ungrouped.favouritesInGroup('group-1').map(displayNameOf)).toEqual(['b.md']);
    expect(removed.groups()).toEqual([]);
    expect(removed.favouritesInGroup(undefined)).toHaveLength(2);
  });

  it('tells favourite commands apart from other commands', () => {
    expect(isFavouriteCommand({ kind: 'renameFavourite' })).toBe(true);
    expect(isFavouriteCommand({ kind: 'pinTab' })).toBe(false);
  });
});
