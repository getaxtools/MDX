import type { AppWindowsPort, WindowStateReport, WorkspaceIdListener } from '../AppWindowsPort';

export class InMemoryAppWindows implements AppWindowsPort {
  startupWorkspace: string | undefined;
  hasStartupWorkspaceNotice = false;
  /** Workspaces that another window shows. */
  readonly shownElsewhere = new Set<string>();
  readonly focusedWorkspaces: string[] = [];
  readonly reports: WindowStateReport[] = [];
  openedWindowCount = 0;
  private readonly listChangeListeners = new Set<WorkspaceIdListener>();
  private readonly showListeners = new Set<WorkspaceIdListener>();
  private readonly notFoundListeners = new Set<() => void>();

  constructor(readonly windowId = 'main') {}

  startupWorkspaceId(): Promise<string | undefined> {
    return Promise.resolve(this.startupWorkspace);
  }

  takeStartupWorkspaceNotice(): Promise<boolean> {
    const hasNotice = this.hasStartupWorkspaceNotice;
    this.hasStartupWorkspaceNotice = false;
    return Promise.resolve(hasNotice);
  }

  openNewWindow(): Promise<void> {
    this.openedWindowCount += 1;
    return Promise.resolve();
  }

  reportState(report: WindowStateReport): Promise<void> {
    this.reports.push(report);
    return Promise.resolve();
  }

  focusWindowShowing(workspaceId: string): Promise<boolean> {
    if (!this.shownElsewhere.has(workspaceId)) return Promise.resolve(false);
    this.focusedWorkspaces.push(workspaceId);
    return Promise.resolve(true);
  }

  onWorkspaceListChanged(listener: WorkspaceIdListener): () => void {
    this.listChangeListeners.add(listener);
    return () => this.listChangeListeners.delete(listener);
  }

  onShowWorkspaceRequested(listener: WorkspaceIdListener): () => void {
    this.showListeners.add(listener);
    return () => this.showListeners.delete(listener);
  }

  onWorkspaceNotFound(listener: () => void): () => void {
    this.notFoundListeners.add(listener);
    return () => this.notFoundListeners.delete(listener);
  }

  /** Acts as another window saving a list of the workspace. */
  changeListsElsewhere(workspaceId: string): void {
    for (const listener of this.listChangeListeners) listener(workspaceId);
  }

  askToShow(workspaceId: string): void {
    for (const listener of this.showListeners) listener(workspaceId);
  }

  askForMissingWorkspace(): void {
    for (const listener of this.notFoundListeners) listener();
  }
}
