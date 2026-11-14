import type { ViewerSession, WorkspaceKindId } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { workspaceNameOf, type WorkspaceCommand } from './workspaceCommands';

const WORKSPACE_DIALOGS = ['newWorkspace', 'renameWorkspace', 'deleteWorkspace'] as const;

export type WorkspaceDialog = (typeof WORKSPACE_DIALOGS)[number];

export function isWorkspaceDialog(dialog: string | undefined): dialog is WorkspaceDialog {
  return WORKSPACE_DIALOGS.some((workspaceDialog) => workspaceDialog === dialog);
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
}

/** New, Rename, Delete and Switch Workspace; switching away asks about unsaved edits first. */
export class WorkspaceActions {
  /** The kind the New Workspace dialog starts on, such as the kind chosen on the control wheel. */
  private newWorkspaceKindId: WorkspaceKindId | undefined;

  constructor(private readonly dependencies: WorkspaceActionsDependencies) {}

  kindForNewWorkspace(): WorkspaceKindId | undefined {
    return this.newWorkspaceKindId;
  }

  async run(command: WorkspaceCommand): Promise<void> {
    switch (command.kind) {
      case 'showNewWorkspace':
        this.newWorkspaceKindId = command.kindId;
        this.dependencies.showDialog('newWorkspace');
        return;
      case 'createWorkspace':
        return this.create(command.name, command.kindId);
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
    }
  }

  private async create(name: string, kindId: WorkspaceKindId): Promise<void> {
    if (!(await this.dependencies.confirmLeavingDocuments())) return;
    const change = await this.dependencies.session.createWorkspace({ name, kindId });
    if (change?.outcome !== 'changed') return;
    this.dependencies.showDialog(undefined);
    await this.dependencies.showSwitchedWorkspace();
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

  private async switchTo(workspaceId: string): Promise<void> {
    const { session } = this.dependencies;
    if (session.shownWorkspace()?.id === workspaceId) return;
    if (!(await this.dependencies.confirmLeavingDocuments())) return;
    await session.switchWorkspace(workspaceId);
    this.dependencies.showDialog(undefined);
    await this.dependencies.showSwitchedWorkspace();
  }
}
