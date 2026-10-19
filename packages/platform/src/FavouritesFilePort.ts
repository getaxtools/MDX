export interface FavouritesFilePort {
  /** Asks where to save the exported favourites; resolves to the saved path, or undefined on cancel. */
  exportFavourites(contents: string, suggestedFileName: string): Promise<string | undefined>;
  /** Asks for an exported favourites file; resolves to its text, or undefined on cancel. */
  importFavourites(): Promise<string | undefined>;
}
