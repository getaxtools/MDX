import type { DocumentLocation } from '@mdx/platform';

export const MAX_EXPLORER_FOLDERS = 50;

/** The folders opened with Open Folder, shown as roots in the Explorer's Folders section. */
export class ExplorerFolders {
  private constructor(private readonly locations: readonly DocumentLocation[]) {}

  static empty(): ExplorerFolders {
    return new ExplorerFolders([]);
  }

  static fromFolders(locations: readonly DocumentLocation[]): ExplorerFolders {
    return locations.reduce((folders, location) => folders.add(location), ExplorerFolders.empty());
  }

  folders(): readonly DocumentLocation[] {
    return this.locations;
  }

  has(canonicalKey: string): boolean {
    return this.locations.some((location) => location.canonicalKey === canonicalKey);
  }

  /** Adds a folder at the end; a folder that is already open, or one past the limit, changes nothing. */
  add(location: DocumentLocation): ExplorerFolders {
    if (this.has(location.canonicalKey) || this.locations.length >= MAX_EXPLORER_FOLDERS) return this;
    return new ExplorerFolders([...this.locations, location]);
  }

  remove(canonicalKey: string): ExplorerFolders {
    return new ExplorerFolders(this.locations.filter((location) => location.canonicalKey !== canonicalKey));
  }
}
