import type { FavouritesFilePort } from '../FavouritesFilePort';

export class InMemoryFavouritesFile implements FavouritesFilePort {
  readonly exportedFiles: { readonly contents: string; readonly suggestedFileName: string }[] = [];
  /** The path the user picks in the next export dialog; undefined means they cancel. */
  exportPath: string | undefined;
  /** The text of the file the user picks in the next import dialog; undefined means they cancel. */
  importedText: string | undefined;

  exportFavourites(contents: string, suggestedFileName: string): Promise<string | undefined> {
    if (this.exportPath !== undefined) this.exportedFiles.push({ contents, suggestedFileName });
    return Promise.resolve(this.exportPath);
  }

  importFavourites(): Promise<string | undefined> {
    return Promise.resolve(this.importedText);
  }
}
