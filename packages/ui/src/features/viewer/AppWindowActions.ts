import type { ViewerSession } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import { hasFile, type AppWindowsPort, type WindowStateReport } from '@mdx/platform';

export interface AppWindowActionsDependencies {
  readonly appWindows: AppWindowsPort;
  readonly session: ViewerSession;
  /** Shows the workspace in this window, asking about unsaved edits first. */
  readonly showWorkspace: (workspaceId: string) => Promise<void>;
  readonly showNotice: (key: MessageKey) => void;
  readonly saveNow: () => Promise<void>;
}

/** New Window, and what this window tells the others: its workspace, tabs and folders. */
export class AppWindowActions {
  private reportedJson: string | undefined;

  constructor(private readonly dependencies: AppWindowActionsDependencies) {}

  async start(): Promise<() => void> {
    const { appWindows, session, showWorkspace, showNotice } = this.dependencies;
    const stopActions = [
      appWindows.onWorkspaceListChanged((workspaceId) => void session.reloadWorkspaceLists(workspaceId)),
      appWindows.onShowWorkspaceRequested((workspaceId) => void showWorkspace(workspaceId)),
      appWindows.onWorkspaceNotFound(() => showNotice('windows.workspaceNotFound')),
    ];
    this.reportState();
    if (await appWindows.takeStartupWorkspaceNotice()) showNotice('windows.startupWorkspaceMissing');
    return () => {
      for (const stop of stopActions) stop();
    };
  }

  /** Sends the window's state when it changed since the last report. */
  reportState(): void {
    const report = this.currentReport();
    if (!report) return;
    const json = JSON.stringify(report);
    if (json === this.reportedJson) return;
    this.reportedJson = json;
    void this.dependencies.appWindows.reportState(report).catch(() => {
      this.reportedJson = undefined;
    });
  }

  /** Saves first, so the new window starts from this window's lists. */
  async openNewWindow(): Promise<void> {
    await this.dependencies.saveNow();
    await this.dependencies.appWindows.openNewWindow();
  }

  private currentReport(): WindowStateReport | undefined {
    const { session } = this.dependencies;
    const workspaceId = session.shownWorkspace()?.id;
    if (workspaceId === undefined) return undefined;
    const state = session.currentState();
    return {
      workspaceId,
      openDocumentPaths: state.tabStrip
        .tabs()
        .map((tab) => tab.location)
        .filter(hasFile)
        .map((location) => location.displayPath),
      rootPaths: state.explorerFolders.folders().map((folder) => folder.displayPath),
    };
  }
}
