import {
  WORKSPACE_LIST_NAMES,
  type AppWindowsPort,
  type WindowStateReport,
  type WorkspaceIdListener,
  type WorkspaceListChangeListener,
  type WorkspaceListName,
  type WorkspaceToShow,
} from '@mdx/platform';
import {
  SHOW_WORKSPACE_EVENT,
  WORKSPACE_DELETED_EVENT,
  WORKSPACE_LIST_CHANGED_EVENT,
  WORKSPACE_NOT_FOUND_EVENT,
  tauriCommands,
} from './tauriCommands';
import { listenInThisWindow, thisWindowLabel } from './windowEvents';

interface ChangedList {
  readonly workspaceId: string;
  readonly listName: string;
}

function isWorkspaceListName(name: string): name is WorkspaceListName {
  return WORKSPACE_LIST_NAMES.some((listName) => listName === name);
}

export class TauriAppWindows implements AppWindowsPort {
  readonly windowId = thisWindowLabel();

  async startupWorkspaceId(): Promise<string | undefined> {
    return (await tauriCommands.windowStartupWorkspace()) ?? undefined;
  }

  takeStartupWorkspaceNotice(): Promise<boolean> {
    return tauriCommands.takeStartupWorkspaceNotice();
  }

  async openNewWindow(): Promise<void> {
    await tauriCommands.openNewWindow();
  }

  async reportState(report: WindowStateReport): Promise<void> {
    await tauriCommands.reportWindowState(report);
  }

  focusWindowShowing(workspaceId: string): Promise<boolean> {
    return tauriCommands.focusWindowShowing(workspaceId);
  }

  onWorkspaceListChanged(listener: WorkspaceListChangeListener): () => void {
    return listenInThisWindow<ChangedList>(WORKSPACE_LIST_CHANGED_EVENT, ({ payload }) => {
      if (isWorkspaceListName(payload.listName)) listener(payload.workspaceId, payload.listName);
    });
  }

  onShowWorkspaceRequested(listener: (request: WorkspaceToShow) => void): () => void {
    return listenInThisWindow<WorkspaceToShow>(SHOW_WORKSPACE_EVENT, (event) => listener(event.payload));
  }

  onWorkspaceNotFound(listener: () => void): () => void {
    return listenInThisWindow<null>(WORKSPACE_NOT_FOUND_EVENT, () => listener());
  }

  onWorkspaceDeleted(listener: WorkspaceIdListener): () => void {
    return listenInThisWindow<string>(WORKSPACE_DELETED_EVENT, (event) => listener(event.payload));
  }
}
