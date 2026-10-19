import type { DocumentLocation } from '@mdx/platform';

export type FavouriteKind = 'file' | 'folder';

export interface Favourite {
  readonly location: DocumentLocation;
  readonly kind: FavouriteKind;
  readonly label?: string;
  readonly groupId?: string;
}

export interface FavouriteGroup {
  readonly id: string;
  readonly name: string;
}

const GROUP_ID_PREFIX = 'group-';

export function displayNameOf(favourite: Favourite): string {
  return favourite.label ?? favourite.location.fileName;
}

/** An id that no existing group uses, so the caller can refer to a group before it exists. */
export function nextFavouriteGroupId(groups: readonly FavouriteGroup[]): string {
  const numbers = groups.map((group) => Number(group.id.slice(GROUP_ID_PREFIX.length)) || 0);
  return `${GROUP_ID_PREFIX}${String(Math.max(0, ...numbers) + 1)}`;
}

export class FavouritesList {
  private constructor(
    private readonly orderedFavourites: readonly Favourite[],
    private readonly orderedGroups: readonly FavouriteGroup[],
  ) {}

  static empty(): FavouritesList {
    return new FavouritesList([], []);
  }

  static fromFavourites(
    favourites: readonly Favourite[],
    groups: readonly FavouriteGroup[] = [],
  ): FavouritesList {
    const uniqueGroups = groups.filter(
      (group, index) =>
        group.name.trim() !== '' && groups.findIndex((other) => other.id === group.id) === index,
    );
    const withGroups = new FavouritesList([], uniqueGroups);
    return favourites.reduce((list, favourite) => list.addFavourite(favourite), withGroups);
  }

  favourites(): readonly Favourite[] {
    return this.orderedFavourites;
  }

  groups(): readonly FavouriteGroup[] {
    return this.orderedGroups;
  }

  /** The favourites of one group, or the ungrouped ones for `undefined`, in list order. */
  favouritesInGroup(groupId: string | undefined): readonly Favourite[] {
    return this.orderedFavourites.filter((favourite) => favourite.groupId === groupId);
  }

  isFavourite(canonicalKey: string): boolean {
    return this.orderedFavourites.some((favourite) => favourite.location.canonicalKey === canonicalKey);
  }

  add(location: DocumentLocation, kind: FavouriteKind): FavouritesList {
    return this.addFavourite({ location, kind });
  }

  remove(canonicalKey: string): FavouritesList {
    return this.withFavourites(
      this.orderedFavourites.filter((favourite) => favourite.location.canonicalKey !== canonicalKey),
    );
  }

  toggle(location: DocumentLocation, kind: FavouriteKind): FavouritesList {
    return this.isFavourite(location.canonicalKey)
      ? this.remove(location.canonicalKey)
      : this.add(location, kind);
  }

  rename(canonicalKey: string, label: string): FavouritesList {
    const trimmedLabel = label.trim();
    return this.updateFavourite(canonicalKey, (favourite) =>
      favouriteWith(favourite, trimmedLabel === '' ? undefined : trimmedLabel, favourite.groupId),
    );
  }

  /** Points a favourite at the file's new place, keeping its label, group and position. */
  relocate(canonicalKey: string, location: DocumentLocation): FavouritesList {
    if (canonicalKey === location.canonicalKey || !this.isFavourite(canonicalKey)) return this;
    if (this.isFavourite(location.canonicalKey)) return this.remove(canonicalKey);
    return this.updateFavourite(canonicalKey, (favourite) => ({ ...favourite, location }));
  }

  move(canonicalKey: string, toIndex: number): FavouritesList {
    const favourite = this.orderedFavourites.find((item) => item.location.canonicalKey === canonicalKey);
    if (!favourite) return this;
    const others = this.orderedFavourites.filter((item) => item !== favourite);
    const clampedIndex = Math.min(Math.max(toIndex, 0), others.length);
    return this.withFavourites([...others.slice(0, clampedIndex), favourite, ...others.slice(clampedIndex)]);
  }

  /** Adds a group with the given id, optionally moving a favourite into it straight away. */
  createGroup(groupId: string, name: string, favouriteKey?: string): FavouritesList {
    const trimmedName = name.trim();
    if (trimmedName === '' || this.hasGroup(groupId)) return this;
    const withGroup = new FavouritesList(this.orderedFavourites, [
      ...this.orderedGroups,
      { id: groupId, name: trimmedName },
    ]);
    return favouriteKey === undefined ? withGroup : withGroup.moveToGroup(favouriteKey, groupId);
  }

  renameGroup(groupId: string, name: string): FavouritesList {
    const trimmedName = name.trim();
    if (trimmedName === '') return this;
    return new FavouritesList(
      this.orderedFavourites,
      this.orderedGroups.map((group) => (group.id === groupId ? { ...group, name: trimmedName } : group)),
    );
  }

  /** Removes a group but keeps its favourites, which become ungrouped. */
  removeGroup(groupId: string): FavouritesList {
    const favourites = this.orderedFavourites.map((favourite) =>
      favourite.groupId === groupId ? withoutGroup(favourite) : favourite,
    );
    return new FavouritesList(
      favourites,
      this.orderedGroups.filter((group) => group.id !== groupId),
    );
  }

  /** Moves a favourite into a group, or out of every group for `undefined`. */
  moveToGroup(canonicalKey: string, groupId: string | undefined): FavouritesList {
    if (groupId !== undefined && !this.hasGroup(groupId)) return this;
    return this.updateFavourite(canonicalKey, (favourite) =>
      favouriteWith(favourite, favourite.label, groupId),
    );
  }

  /** Adds the favourites and groups of another list that this one lacks; groups match by name. */
  merge(other: FavouritesList): FavouritesList {
    const { list, groupIds } = this.withGroupsNamed(other.groups());
    return other.favourites().reduce((merged, favourite) => {
      const groupId = favourite.groupId === undefined ? undefined : groupIds.get(favourite.groupId);
      return merged.addFavourite(favouriteWith(favourite, favourite.label, groupId));
    }, list);
  }

  /** Adds the groups whose names are new, and maps each given group id to its id in this list. */
  private withGroupsNamed(groups: readonly FavouriteGroup[]): {
    readonly list: FavouritesList;
    readonly groupIds: ReadonlyMap<string, string>;
  } {
    const groupIds = new Map<string, string>();
    const list = groups.reduce<FavouritesList>((withGroups, group) => {
      const existing = withGroups.groups().find((candidate) => candidate.name === group.name);
      const groupId = existing?.id ?? nextFavouriteGroupId(withGroups.groups());
      groupIds.set(group.id, groupId);
      return existing ? withGroups : withGroups.createGroup(groupId, group.name);
    }, this);
    return { list, groupIds };
  }

  private hasGroup(groupId: string): boolean {
    return this.orderedGroups.some((group) => group.id === groupId);
  }

  private addFavourite(favourite: Favourite): FavouritesList {
    if (this.isFavourite(favourite.location.canonicalKey)) return this;
    const isGroupKnown = favourite.groupId === undefined || this.hasGroup(favourite.groupId);
    return this.withFavourites([
      ...this.orderedFavourites,
      isGroupKnown ? favourite : withoutGroup(favourite),
    ]);
  }

  private updateFavourite(canonicalKey: string, change: (favourite: Favourite) => Favourite): FavouritesList {
    return this.withFavourites(
      this.orderedFavourites.map((favourite) =>
        favourite.location.canonicalKey === canonicalKey ? change(favourite) : favourite,
      ),
    );
  }

  private withFavourites(favourites: readonly Favourite[]): FavouritesList {
    return new FavouritesList(favourites, this.orderedGroups);
  }
}

function withoutGroup(favourite: Favourite): Favourite {
  return favouriteWith(favourite, favourite.label, undefined);
}

function favouriteWith(
  favourite: Favourite,
  label: string | undefined,
  groupId: string | undefined,
): Favourite {
  return {
    location: favourite.location,
    kind: favourite.kind,
    ...(label === undefined ? {} : { label }),
    ...(groupId === undefined ? {} : { groupId }),
  };
}
