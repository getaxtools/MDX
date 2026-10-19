import { isRecord } from '../session/savedValues';
import type { FavouritesList } from './FavouritesList';
import { parseFavourites } from './parseFavourites';

export const FAVOURITES_FILE_FORMAT = 'mdx-favourites';
export const FAVOURITES_FILE_VERSION = 1;

/** The favourites and their groups as a JSON file that another installation can import. */
export function toFavouritesFile(favourites: FavouritesList): string {
  const file = {
    format: FAVOURITES_FILE_FORMAT,
    version: FAVOURITES_FILE_VERSION,
    groups: favourites.groups(),
    favourites: favourites.favourites(),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** The favourites in an exported file, or undefined when the text is not such a file. */
export function parseFavouritesFile(text: string): FavouritesList | undefined {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(file) || file.format !== FAVOURITES_FILE_FORMAT || file.version !== FAVOURITES_FILE_VERSION) {
    return undefined;
  }
  return parseFavourites(file.favourites, file.groups);
}
