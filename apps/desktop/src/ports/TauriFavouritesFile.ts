import type { FavouritesFilePort } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriFavouritesFile implements FavouritesFilePort {
  async exportFavourites(contents: string, suggestedFileName: string): Promise<string | undefined> {
    return (await tauriCommands.exportFavourites(contents, suggestedFileName)) ?? undefined;
  }

  async importFavourites(): Promise<string | undefined> {
    return (await tauriCommands.importFavourites()) ?? undefined;
  }
}
