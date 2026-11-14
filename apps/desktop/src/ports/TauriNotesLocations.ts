import type {
  DocumentLocation,
  KnownFolders,
  LocationAvailability,
  NotesLocationPort,
  PreparedNotesLocation,
} from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriNotesLocations implements NotesLocationPort {
  async knownFolders(): Promise<KnownFolders> {
    const folders = await tauriCommands.knownFolders();
    return { documents: folders.documents ?? undefined, syncedFolders: folders.syncedFolders };
  }

  prepareLocation(path: string, locationId: string): Promise<PreparedNotesLocation> {
    return tauriCommands.prepareNotesLocation(path, locationId);
  }

  checkLocation(path: string, locationId: string): Promise<LocationAvailability> {
    return tauriCommands.checkNotesLocation(path, locationId);
  }

  async locateLocation(path: string, locationId: string): Promise<DocumentLocation | undefined> {
    return (await tauriCommands.locateNotesLocation(path, locationId)) ?? undefined;
  }
}
