import type {
  AppWindowsPort,
  WindowStateReport,
  WorkspaceIdListener,
  WorkspaceListChangeListener,
  WorkspaceToShow,
} from '../AppWindowsPort';
import type { WorkspaceListName } from '../WorkspaceStorePort';

export class InMemoryAppWindows implements AppWindowsPort {
  startupWorkspace: string | undefined;
  hasStartupWorkspaceNotice = false;
  /** Workspaces that another window shows. */
  readonly shownElsewhere = new Set<string>();
  readonly focusedWorkspaces: string[] = [];
  readonly reports: WindowStateReport[] = [];
  openedWindowCount = 0;
  private readonly listChangeListeners = new Set<WorkspaceListChangeListener>();
  private readonly showListeners = new Set<(request: WorkspaceToShow) => void>();
  private readonly notFoundListeners = new Set<() => void>();
  private readonly deletedListeners = new Set<WorkspaceIdListener>();

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

  readonly routedDocuments: string[] = [];

  routeDocuments(paths: readonly string[]): Promise<void> {
    this.routedDocuments.push(...paths);
    return Promise.resolve();
  }

  focusWindowShowing(workspaceId: string): Promise<boolean> {
    if (!this.shownElsewhere.has(workspaceId)) return Promise.resolve(false);
    this.focusedWorkspaces.push(workspaceId);
    return Promise.resolve(true);
  }

  onWorkspaceListChanged(listener: WorkspaceListChangeListener): () => void {
    this.listChangeListeners.add(listener);
    return () => this.listChangeListeners.delete(listener);
  }

  onShowWorkspaceRequested(listener: (request: WorkspaceToShow) => void): () => void {
    this.showListeners.add(listener);
    return () => this.showListeners.delete(listener);
  }

  onWorkspaceNotFound(listener: () => void): () => void {
    this.notFoundListeners.add(listener);
    return () => this.notFoundListeners.delete(listener);
  }

  onWorkspaceDeleted(listener: WorkspaceIdListener): () => void {
    this.deletedListeners.add(listener);
    return () => this.deletedListeners.delete(listener);
  }

  /** Acts as another window saving a list of the workspace. */
  changeListElsewhere(workspaceId: string, listName: WorkspaceListName): void {
    for (const listener of this.listChangeListeners) listener(workspaceId, listName);
  }

  askToShow(workspaceId: string, documentPaths: readonly string[] = []): void {
    for (const listener of this.showListeners) listener({ workspaceId, documentPaths });
  }

  askForMissingWorkspace(): void {
    for (const listener of this.notFoundListeners) listener();
  }

  deleteElsewhere(workspaceId: string): void {
    for (const listener of this.deletedListeners) listener(workspaceId);
  }
}
