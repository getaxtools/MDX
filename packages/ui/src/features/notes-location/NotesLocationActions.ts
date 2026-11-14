import {
  claimedNotesLocations,
  locationClaimProblem,
  notesKindData,
  notesLocationOf,
  type NotesLocation,
  type ViewerSession,
} from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import type { DocumentLocation, NotesLocationPort } from '@mdx/platform';

export type NotesLocationCommand =
  | { readonly kind: 'retryNotesLocation' }
  | { readonly kind: 'locateNotesLocation' }
  | { readonly kind: 'chooseNotesLocation' };

const NOTES_LOCATION_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'retryNotesLocation',
  'locateNotesLocation',
  'chooseNotesLocation',
]);

export function isNotesLocationCommand(command: { readonly kind: string }): command is NotesLocationCommand {
  return NOTES_LOCATION_COMMAND_KINDS.has(command.kind);
}

export interface NotesLocationActionsDependencies {
  readonly session: ViewerSession;
  readonly notesLocations: NotesLocationPort;
  /** The folder picker; the picked folder becomes readable, as any folder the user opens. */
  readonly pickFolder: () => Promise<string | undefined>;
  readonly showNotice: (key: MessageKey, values?: Readonly<Record<string, string>>) => void;
  /** The shown workspace's folder became available or not. */
  readonly onChange: () => void;
  readonly createLocationId?: () => string;
}

/** Notices a missing Notes folder and offers Try again, Locate folder and Choose another folder. */
export class NotesLocationActions {
  private missingFolder: string | undefined;

  constructor(private readonly dependencies: NotesLocationActionsDependencies) {}

  /** The folder of the shown Notes workspace while it is missing; undefined otherwise. */
  missingLocation(): string | undefined {
    return this.missingFolder;
  }

  async run(command: NotesLocationCommand): Promise<void> {
    if (command.kind === 'retryNotesLocation') await this.retry();
    else if (command.kind === 'locateNotesLocation') await this.locate();
    else await this.chooseAnother();
  }

  /** Runs whenever a workspace is shown; the folder is looked for, never created. */
  async check(): Promise<void> {
    const location = this.shownLocation();
    const availability = location
      ? await this.dependencies.notesLocations.checkLocation(location.path, location.locationId)
      : 'available';
    this.missingFolder = availability === 'notAvailable' ? location?.path : undefined;
    this.dependencies.onChange();
  }

  private async retry(): Promise<void> {
    await this.check();
    if (this.missingFolder !== undefined) this.dependencies.showNotice('notes.missing.stillMissing');
  }

  private async locate(): Promise<void> {
    const location = this.shownLocation();
    const picked = location ? await this.dependencies.pickFolder() : undefined;
    if (!location || picked === undefined) return;
    const found = await this.dependencies.notesLocations.locateLocation(picked, location.locationId);
    if (!found) {
      this.dependencies.showNotice('notes.missing.otherFolder');
      return;
    }
    await this.moveShownWorkspaceTo(found, location.locationId, location);
  }

  /** A fresh location: the notes in the missing folder stay where they are. */
  private async chooseAnother(): Promise<void> {
    const location = this.shownLocation();
    const picked = location ? await this.pickUnclaimedFolder() : undefined;
    if (!location || picked === undefined) return;
    const newId = this.dependencies.createLocationId?.() ?? crypto.randomUUID();
    try {
      const prepared = await this.dependencies.notesLocations.prepareLocation(picked, newId);
      await this.moveShownWorkspaceTo(prepared.location, prepared.locationId, location);
    } catch {
      this.dependencies.showNotice('workspaces.notes.locationFailed', { path: picked });
    }
  }

  private async pickUnclaimedFolder(): Promise<string | undefined> {
    const { session, showNotice } = this.dependencies;
    const picked = await this.dependencies.pickFolder();
    if (picked === undefined) return undefined;
    const claimed = claimedNotesLocations(
      session.workspaces()?.workspaces() ?? [],
      session.shownWorkspace()?.id,
    );
    const problem = locationClaimProblem(picked, claimed);
    if (!problem) return picked;
    showNotice(`workspaces.notes.claim.${problem}`);
    return undefined;
  }

  private async moveShownWorkspaceTo(
    folder: DocumentLocation,
    locationId: string,
    previous: NotesLocation,
  ): Promise<void> {
    const { session } = this.dependencies;
    const shownId = session.shownWorkspace()?.id;
    if (shownId === undefined) return;
    const location = { path: folder.displayPath, canonicalKey: folder.canonicalKey, locationId };
    await session.updateWorkspaceKindData(shownId, notesKindData(location));
    session.updateExplorerFolders((folders) => folders.remove(previous.canonicalKey).add(folder));
    this.missingFolder = undefined;
    this.dependencies.onChange();
  }

  private shownLocation(): NotesLocation | undefined {
    const shown = this.dependencies.session.shownWorkspace();
    return shown ? notesLocationOf(shown) : undefined;
  }
}
