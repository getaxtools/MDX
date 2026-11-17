import type { AppWindowsPort, WindowStateReport, WorkspaceIdListener } from '@mdx/platform';
import {
  SHOW_WORKSPACE_EVENT,
  WORKSPACE_LIST_CHANGED_EVENT,
  WORKSPACE_NOT_FOUND_EVENT,
  tauriCommands,
} from './tauriCommands';
import { listenInThisWindow, thisWindowLabel } from './windowEvents';

interface ChangedList {
  readonly workspaceId: string;
  readonly listName: string;
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

  onWorkspaceListChanged(listener: WorkspaceIdListener): () => void {
    return listenInThisWindow<ChangedList>(WORKSPACE_LIST_CHANGED_EVENT, (event) =>
      listener(event.payload.workspaceId),
    );
  }

  onShowWorkspaceRequested(listener: WorkspaceIdListener): () => void {
    return listenInThisWindow<string>(SHOW_WORKSPACE_EVENT, (event) => listener(event.payload));
  }

  onWorkspaceNotFound(listener: () => void): () => void {
    return listenInThisWindow<null>(WORKSPACE_NOT_FOUND_EVENT, () => listener());
  }
}
