import { parseLocation, validEntries } from '../session/savedValues';
import { FavouritesList, type Favourite, type FavouriteGroup } from './FavouritesList';

/** Favourites and groups read from saved state or an exported file; invalid entries are dropped. */
export function parseFavourites(savedFavourites: unknown, savedGroups: unknown): FavouritesList {
  return FavouritesList.fromFavourites(
    validEntries(savedFavourites, parseFavourite),
    validEntries(savedGroups, parseFavouriteGroup),
  );
}

function parseFavourite(value: Record<string, unknown>): Favourite | undefined {
  const location = parseLocation(value.location);
  if (!location || (value.kind !== 'file' && value.kind !== 'folder')) return undefined;
  return {
    location,
    kind: value.kind,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    ...(typeof value.groupId === 'string' ? { groupId: value.groupId } : {}),
  };
}

function parseFavouriteGroup(value: Record<string, unknown>): FavouriteGroup | undefined {
  const { id, name } = value;
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : undefined;
}
