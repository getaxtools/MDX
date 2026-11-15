import {
  NOTES_KIND_ID,
  WORKSPACE_FILE_EXTENSION,
  readWorkspaceFile,
  writeWorkspaceFile,
  type InitialWorkspaceLists,
  type PortableWorkspace,
  type ViewerSession,
  type WorkspaceRequest,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import type { WorkspaceFileContents, WorkspaceFilePort } from '@mdx/platform';
import { workspaceNameOf } from './workspaceCommands';
import { workspaceColourOf, workspaceIconOf } from './workspacePresentation';

/** A read workspace file waiting for the user to confirm it. */
export interface PendingWorkspaceFile {
  readonly path: string;
  readonly workspace: PortableWorkspace;
  /** The kind is built but turned off, so confirming turns it on first. */
  readonly isKindDisabled: boolean;
}

export interface WorkspaceFileActionsDependencies {
  readonly session: ViewerSession;
  readonly translator: Translator;
  readonly workspaceFiles: WorkspaceFilePort;
  readonly showConfirmation: (pending: PendingWorkspaceFile | undefined) => void;
  readonly showNotice: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => void;
  /** Switches after asking about unsaved edits; false when the user cancelled. */
  readonly switchTo: (workspaceId: string) => Promise<void>;
  readonly createAndShow: (request: WorkspaceRequest, lists: InitialWorkspaceLists) => Promise<void>;
  /** A Notes workspace file has no folder, so the user chooses one before it is created. */
  readonly chooseNotesFolder: (request: WorkspaceRequest, workspace: PortableWorkspace) => Promise<void>;
}

/** Export Workspace and opening workspace files, from the menu, from Windows or at start-up. */
export class WorkspaceFileActions {
  private pending: PendingWorkspaceFile | undefined;

  constructor(private readonly dependencies: WorkspaceFileActionsDependencies) {}

  async export(): Promise<void> {
    const { session, translator, workspaceFiles, showNotice } = this.dependencies;
    const shown = session.shownWorkspace();
    if (!shown) return;
    const name = workspaceNameOf(shown, translator);
    try {
      const place = await workspaceFiles.chooseExportPlace(`${name}${WORKSPACE_FILE_EXTENSION}`);
      if (!place) return;
      const { text, absolutePathCount } = writeWorkspaceFile(this.portableShownWorkspace(name), place.folder);
      const savedPath = await workspaceFiles.writeExport(text);
      const fileName = savedPath.split('\\').at(-1) ?? savedPath;
      if (absolutePathCount === 0) showNotice('workspaces.file.exported', { fileName });
      else showNotice('workspaces.file.exportedWithAbsolute', { fileName, count: absolutePathCount });
    } catch {
      showNotice('workspaces.file.exportFailed');
    }
  }

  async open(): Promise<void> {
    try {
      const contents = await this.dependencies.workspaceFiles.openWorkspaceFile();
      if (contents) await this.offer(contents);
    } catch {
      this.dependencies.showNotice('workspaces.file.openFailed');
    }
  }

  /** A file opened before switches to its workspace; a new one is shown for confirmation first. */
  async offer(contents: WorkspaceFileContents): Promise<void> {
    const { session, showNotice, showConfirmation } = this.dependencies;
    const registry = session.workspaces();
    if (!registry) return;
    const existing = registry.findBySourceFile(contents.path);
    if (existing) {
      await this.dependencies.switchTo(existing.id);
      return;
    }
    const kinds = session.currentState().workspaceKinds;
    const reading = readWorkspaceFile(contents.text, {
      fileFolder: contents.folder,
      kindRegistry: kinds.kinds(),
    });
    if (reading.outcome === 'refused') {
      showNotice(`workspaces.file.refused.${reading.reason}`);
      return;
    }
    this.pending = {
      path: contents.path,
      workspace: reading.workspace,
      isKindDisabled: !kinds.isEnabled(reading.workspace.kindId),
    };
    showConfirmation(this.pending);
  }

  /** Nothing is created or made readable until this runs. */
  async confirm(): Promise<void> {
    const pending = this.pending;
    const registry = this.dependencies.session.workspaces();
    this.cancel();
    if (!pending || !registry) return;
    const { workspace, path, isKindDisabled } = pending;
    if (isKindDisabled)
      this.dependencies.session.updateWorkspaceKinds((kinds) => kinds.enableKind(workspace.kindId).state);
    const request = {
      name: registry.freeNameFor(workspace.name, workspace.kindId),
      kindId: workspace.kindId,
      icon: workspaceIconOf(workspace.icon),
      colour: workspaceColourOf(workspace.colour),
      sourceFile: path,
    };
    if (workspace.kindId === NOTES_KIND_ID) {
      await this.dependencies.chooseNotesFolder(request, workspace);
      return;
    }
    await this.dependencies.createAndShow(request, {
      explorerFolders: workspace.roots,
      favourites: workspace.favourites,
      favouriteGroups: workspace.favouriteGroups,
      settingsOverrides: workspace.settingsOverrides,
    });
  }

  cancel(): void {
    this.pending = undefined;
    this.dependencies.showConfirmation(undefined);
  }

  private portableShownWorkspace(name: string): PortableWorkspace {
    const { session } = this.dependencies;
    const shown = session.shownWorkspace();
    const state = session.currentState();
    return {
      name,
      kindId: shown?.kindId ?? '',
      icon: shown?.icon ?? null,
      colour: shown?.colour ?? null,
      roots: state.explorerFolders.folders(),
      favourites: state.favourites.favourites(),
      favouriteGroups: state.favourites.groups(),
      settingsOverrides: state.workspaceOverrides ?? {},
    };
  }
}
