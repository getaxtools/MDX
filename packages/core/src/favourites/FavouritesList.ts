import type { DocumentLocation } from '@mdx/platform';

export type FavouriteKind = 'file' | 'folder';

export interface Favourite {
  readonly location: DocumentLocation;
  readonly kind: FavouriteKind;
  readonly label?: string;
}

export function displayNameOf(favourite: Favourite): string {
  return favourite.label ?? favourite.location.fileName;
}

export class FavouritesList {
  private constructor(private readonly orderedFavourites: readonly Favourite[]) {}

  static empty(): FavouritesList {
    return new FavouritesList([]);
  }

  static fromFavourites(favourites: readonly Favourite[]): FavouritesList {
    return favourites.reduce((list, favourite) => list.addFavourite(favourite), FavouritesList.empty());
  }

  favourites(): readonly Favourite[] {
    return this.orderedFavourites;
  }

  isFavourite(canonicalKey: string): boolean {
    return this.orderedFavourites.some((favourite) => favourite.location.canonicalKey === canonicalKey);
  }

  add(location: DocumentLocation, kind: FavouriteKind): FavouritesList {
    return this.addFavourite({ location, kind });
  }

  remove(canonicalKey: string): FavouritesList {
    return new FavouritesList(
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
    return new FavouritesList(
      this.orderedFavourites.map((favourite) => {
        if (favourite.location.canonicalKey !== canonicalKey) return favourite;
        return trimmedLabel === ''
          ? { location: favourite.location, kind: favourite.kind }
          : { ...favourite, label: trimmedLabel };
      }),
    );
  }

  move(canonicalKey: string, toIndex: number): FavouritesList {
    const favourite = this.orderedFavourites.find((item) => item.location.canonicalKey === canonicalKey);
    if (!favourite) return this;
    const others = this.orderedFavourites.filter((item) => item !== favourite);
    const clampedIndex = Math.min(Math.max(toIndex, 0), others.length);
    return new FavouritesList([...others.slice(0, clampedIndex), favourite, ...others.slice(clampedIndex)]);
  }

  private addFavourite(favourite: Favourite): FavouritesList {
    if (this.isFavourite(favourite.location.canonicalKey)) return this;
    return new FavouritesList([...this.orderedFavourites, favourite]);
  }
}
