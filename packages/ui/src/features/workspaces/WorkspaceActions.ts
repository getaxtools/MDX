import {
  NOTES_KIND_ID,
  claimedNotesLocations,
  notesKindData,
  notesWorkspaceFileLists,
  type InitialWorkspaceLists,
  type PortableWorkspace,
  type ViewerSession,
  type WorkspaceKindId,
  type WorkspaceRequest,
} from '@mdx/core';
import type { DocumentLocation, NotesLocationPort } from '@mdx/platform';
import type { MessageKey, Translator } from '@mdx/i18n';
import { workspaceNameOf, type WorkspaceCommand, type WorkspaceDetails } from './workspaceCommands';

const WORKSPACE_DIALOGS = [
  'newWorkspace',
  'renameWorkspace',
  'deleteWorkspace',
  'workspaceSwitcher',
  'openWorkspaceFile',
] as const;

export type WorkspaceDialog = (typeof WORKSPACE_DIALOGS)[number];

export function isWorkspaceDialog(dialog: string | undefined): dialog is WorkspaceDialog {
  return WORKSPACE_DIALOGS.some((workspaceDialog) => workspaceDialog === dialog);
}

/** What the New Workspace dialog needs to suggest and check a Notes folder. */
export interface NotesSetup {
  readonly documents: string | undefined;
  readonly syncedFolders: readonly string[];
  /** Folders other Notes workspaces use, which a new one may not overlap. */
  readonly claimedPaths: readonly string[];
}

export interface WorkspaceActionsDependencies {
  readonly session: ViewerSession;
  readonly translator: Translator;
  /** Asks to save, discard or cancel unsaved edits; false when the user cancels. */
  readonly confirmLeavingDocuments: () => Promise<boolean>;
  readonly showDialog: (dialog: WorkspaceDialog | undefined) => void;
  readonly showNotice: (key: MessageKey, values?: Readonly<Record<string, string>>) => void;
  /** Shows the documents of the workspace the window switched to. */
  readonly showSwitchedWorkspace: () => Promise<void>;
  /** The folder picker that adds a folder to the Explorer of the shown workspace. */
  readonly addFolder: () => Promise<void>;
  /** Absent where Notes workspaces cannot be made, such as outside the desktop app. */
  readonly notesLocations?: NotesLocationPort | undefined;
  /** Ids for new Notes locations; random UUIDs unless a test needs fixed ones. */
  readonly createLocationId?: () => string;
}

/** A Notes workspace file waiting for its notes folder, since the file carries none. */
export interface NotesWorkspaceFileDraft {
  readonly request: WorkspaceRequest;
  readonly workspace: PortableWorkspace;
}

/** What New Workspace starts with when it finishes a workspace file; its kind is fixed. */
export type NewWorkspaceFromFile = Pick<WorkspaceRequest, 'name' | 'icon' | 'colour'>;

/** New, Rename, Delete and Switch Workspace; switching away asks about unsaved edits first. */
export class WorkspaceActions {
  /** The kind the New Workspace dialog starts on, such as the kind chosen on the control wheel. */
  private newWorkspaceKindId: WorkspaceKindId | undefined;
  private shownNotesSetup: NotesSetup | undefined;
  private fileDraft: NotesWorkspaceFileDraft | undefined;

  constructor(private readonly dependencies: WorkspaceActionsDependencies) {}

  kindForNewWorkspace(): WorkspaceKindId | undefined {
    return this.newWorkspaceKindId;
  }

  newWorkspaceFromFile(): NewWorkspaceFromFile | undefined {
    if (!this.fileDraft) return undefined;
    const { name, icon, colour } = this.fileDraft.request;
    return { name, icon, colour };
  }

  forgetWorkspaceFile(): void {
    this.fileDraft = undefined;
  }

  /** Shows New Workspace for the file, so the workspace is created only once its folder is prepared. */
  async chooseFolderForWorkspaceFile(draft: NotesWorkspaceFileDraft): Promise<void> {
    this.newWorkspaceKindId = NOTES_KIND_ID;
    this.shownNotesSetup = await this.loadNotesSetup();
    this.fileDraft = draft;
    this.dependencies.showDialog('newWorkspace');
  }

  notesSetup(): NotesSetup | undefined {
    return this.shownNotesSetup;
  }

  async run(command: WorkspaceCommand): Promise<void> {
    switch (command.kind) {
      case 'showNewWorkspace':
        this.newWorkspaceKindId = command.kindId;
        this.fileDraft = undefined;
        this.shownNotesSetup = await this.loadNotesSetup();
        this.dependencies.showDialog('newWorkspace');
        return;
      case 'createWorkspace':
        return this.create(command);
      case 'showRenameWorkspace':
        this.dependencies.showDialog('renameWorkspace');
        return;
      case 'renameWorkspace':
        return this.rename(command.name);
      case 'confirmDeleteWorkspace':
        this.confirmDelete();
        return;
      case 'deleteWorkspace':
        return this.delete();
      case 'switchWorkspace':
        return this.switchTo(command.workspaceId);
      case 'showWorkspaceSwitcher':
        this.dependencies.showDialog('workspaceSwitcher');
        return;
      case 'setWorkspaceOverride':
        this.dependencies.session.setWorkspaceOverride(command.field, command.isOverridden);
        return;
    }
  }

  private async create(details: WorkspaceDetails): Promise<void> {
    const isNotes = details.kindId === NOTES_KIND_ID;
    const notesStart = isNotes ? await this.prepareNotesLocation(details) : undefined;
    if (isNotes && !notesStart) return;
    const draft = isNotes ? this.fileDraft : undefined;
    const lists = notesStart ? listsForNotesFolder(notesStart.location, draft?.workspace) : {};
    if (!(await this.createAndShow(requestFor(details, draft, notesStart?.kindData), lists))) return;
    this.fileDraft = undefined;
    if (details.isFolderStepChosen === true) await this.dependencies.addFolder();
  }

  private async loadNotesSetup(): Promise<NotesSetup | undefined> {
    const { notesLocations, session } = this.dependencies;
    if (!notesLocations) return undefined;
    const folders = await notesLocations.knownFolders();
    const claimedPaths = claimedNotesLocations(session.workspaces()?.workspaces() ?? []);
    return { documents: folders.documents, syncedFolders: folders.syncedFolders, claimedPaths };
  }

  /** Marks the chosen folder as a Notes location; nothing is created when it cannot be used. */
  private async prepareNotesLocation({
    notesLocationPath,
  }: WorkspaceDetails): Promise<{ kindData: unknown; location: DocumentLocation } | undefined> {
    const { notesLocations, showNotice } = this.dependencies;
    if (!notesLocations || notesLocationPath === undefined) return undefined;
    const locationId = this.dependencies.createLocationId?.() ?? crypto.randomUUID();
    try {
      const prepared = await notesLocations.prepareLocation(notesLocationPath, locationId);
      const { displayPath, canonicalKey } = prepared.location;
      return {
        kindData: notesKindData({ path: displayPath, canonicalKey, locationId: prepared.locationId }),
        location: prepared.location,
      };
    } catch {
      showNotice('workspaces.notes.locationFailed', { path: notesLocationPath });
      return undefined;
    }
  }

  /** Creates a workspace with its first lists and shows it, after asking about unsaved edits. */
  async createAndShow(request: WorkspaceRequest, lists: InitialWorkspaceLists = {}): Promise<boolean> {
    if (!(await this.dependencies.confirmLeavingDocuments())) return false;
    const change = await this.dependencies.session.createWorkspace(request, lists);
    if (change?.outcome !== 'changed') return false;
    this.dependencies.showDialog(undefined);
    await this.dependencies.showSwitchedWorkspace();
    return true;
  }

  private async rename(name: string): Promise<void> {
    const { session, showDialog } = this.dependencies;
    const shown = session.shownWorkspace();
    if (!shown) return;
    const change = await session.renameWorkspace(shown.id, name);
    if (change?.outcome === 'changed') showDialog(undefined);
  }

  private confirmDelete(): void {
    const { session, translator, showDialog, showNotice } = this.dependencies;
    const shown = session.shownWorkspace();
    if (!shown) return;
    if (session.workspaces()?.canRemove(shown.id)) {
      showDialog('deleteWorkspace');
      return;
    }
    showNotice('workspaces.delete.lastMarkdownViewer', { name: workspaceNameOf(shown, translator) });
  }

  private async delete(): Promise<void> {
    const { session, translator, showDialog, showNotice } = this.dependencies;
    const shown = session.shownWorkspace();
    if (!shown || !(await this.dependencies.confirmLeavingDocuments())) return;
    const removal = await session.deleteWorkspace(shown.id);
    showDialog(undefined);
    if (removal?.outcome !== 'removed') return;
    await this.dependencies.showSwitchedWorkspace();
    showNotice('workspaces.deleted', { name: workspaceNameOf(shown, translator) });
  }

  async switchTo(workspaceId: string): Promise<void> {
    const { session } = this.dependencies;
    if (session.shownWorkspace()?.id === workspaceId) return;
    if (!(await this.dependencies.confirmLeavingDocuments())) return;
    await session.switchWorkspace(workspaceId);
    this.dependencies.showDialog(undefined);
    await this.dependencies.showSwitchedWorkspace();
  }
}

/** The dialog's choices, plus the source file of a workspace file it finishes. */
function requestFor(
  { name, kindId, icon, colour }: WorkspaceDetails,
  draft: NotesWorkspaceFileDraft | undefined,
  kindData: unknown,
): WorkspaceRequest {
  return { ...draft?.request, name, kindId, icon, colour, ...(kindData === undefined ? {} : { kindData }) };
}

function listsForNotesFolder(
  notesFolder: DocumentLocation,
  fromFile: PortableWorkspace | undefined,
): InitialWorkspaceLists {
  if (!fromFile) return { explorerFolders: [notesFolder] };
  return {
    ...notesWorkspaceFileLists(fromFile, notesFolder),
    favouriteGroups: fromFile.favouriteGroups,
    settingsOverrides: fromFile.settingsOverrides,
  };
}
