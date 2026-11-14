import type { KnownFolders, NotesLocationPort, PreparedNotesLocation } from '../NotesLocationPort';

export class InMemoryNotesLocations implements NotesLocationPort {
  folders: KnownFolders = { documents: 'C:\\Users\\Ana\\Documents', syncedFolders: [] };
  /** Location ids of folders that already are Notes locations, by lowercased path. */
  readonly existingLocationIds = new Map<string, string>();
  readonly preparedPaths: string[] = [];
  /** Set to make preparing fail, as a folder the app may not use would. */
  isRefusing = false;

  knownFolders(): Promise<KnownFolders> {
    return Promise.resolve(this.folders);
  }

  prepareLocation(path: string, locationId: string): Promise<PreparedNotesLocation> {
    if (this.isRefusing) return Promise.reject(new Error('The folder cannot be used'));
    this.preparedPaths.push(path);
    const canonicalKey = path.toLowerCase();
    const existingId = this.existingLocationIds.get(canonicalKey);
    const fileName = path.split('\\').filter(Boolean).at(-1) ?? path;
    return Promise.resolve({
      location: { canonicalKey, displayPath: path, fileName },
      locationId: existingId ?? locationId,
      isExisting: existingId !== undefined,
    });
  }
}
