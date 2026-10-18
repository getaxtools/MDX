import type { FavouritesList } from '@mdx/core';

export type FavouriteCommand =
  | { readonly kind: 'removeFavourite'; readonly canonicalKey: string }
  | { readonly kind: 'renameFavourite'; readonly canonicalKey: string; readonly label: string }
  | { readonly kind: 'moveFavourite'; readonly canonicalKey: string; readonly toIndex: number };

type FavouriteCommandHandlers = {
  readonly [Kind in FavouriteCommand['kind']]: (
    favourites: FavouritesList,
    command: Extract<FavouriteCommand, { kind: Kind }>,
  ) => FavouritesList;
};

const FAVOURITE_COMMAND_HANDLERS: FavouriteCommandHandlers = {
  removeFavourite: (favourites, { canonicalKey }) => favourites.remove(canonicalKey),
  renameFavourite: (favourites, { canonicalKey, label }) => favourites.rename(canonicalKey, label),
  moveFavourite: (favourites, { canonicalKey, toIndex }) => favourites.move(canonicalKey, toIndex),
};

export function isFavouriteCommand(command: { readonly kind: string }): command is FavouriteCommand {
  return Object.hasOwn(FAVOURITE_COMMAND_HANDLERS, command.kind);
}

export function applyFavouriteCommand(favourites: FavouritesList, command: FavouriteCommand): FavouritesList {
  const handler = FAVOURITE_COMMAND_HANDLERS[command.kind] as (
    favourites: FavouritesList,
    command: FavouriteCommand,
  ) => FavouritesList;
  return handler(favourites, command);
}
