import type { DocumentLocation } from '../DocumentLocation';
import type {
  KnownFolders,
  LocationAvailability,
  NotesLocationPort,
  PreparedNotesLocation,
} from '../NotesLocationPort';

export class InMemoryNotesLocations implements NotesLocationPort {
  folders: KnownFolders = { documents: 'C:\\Users\\Ana\\Documents', syncedFolders: [] };
  /** Location ids of folders that already are Notes locations, by lowercased path. */
  readonly existingLocationIds = new Map<string, string>();
  readonly preparedPaths: string[] = [];
  /** Lowercased paths of Notes folders that are gone, such as on a removed drive. */
  readonly missingPaths = new Set<string>();
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
    this.existingLocationIds.set(canonicalKey, existingId ?? locationId);
    this.missingPaths.delete(canonicalKey);
    const fileName = path.split('\\').filter(Boolean).at(-1) ?? path;
    return Promise.resolve({
      location: { canonicalKey, displayPath: path, fileName },
      locationId: existingId ?? locationId,
      isExisting: existingId !== undefined,
    });
  }

  checkLocation(path: string, locationId: string): Promise<LocationAvailability> {
    const key = path.toLowerCase();
    const isAvailable = !this.missingPaths.has(key) && this.existingLocationIds.get(key) === locationId;
    return Promise.resolve(isAvailable ? 'available' : 'notAvailable');
  }

  locateLocation(path: string, locationId: string): Promise<DocumentLocation | undefined> {
    const key = path.toLowerCase();
    if (this.existingLocationIds.get(key) !== locationId) return Promise.resolve(undefined);
    const fileName = path.split('\\').filter(Boolean).at(-1) ?? path;
    return Promise.resolve({ canonicalKey: key, displayPath: path, fileName });
  }
}
