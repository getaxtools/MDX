import type { WorkspaceFileContents, WorkspaceFileListener, WorkspaceFilePort } from '../WorkspaceFilePort';

export class InMemoryWorkspaceFiles implements WorkspaceFilePort {
  /** The folder the save dialog answers with; undefined acts as Cancel. */
  exportFolder: string | undefined = 'D:\\team';
  exportFileName = 'Handbook.mdxworkspace';
  readonly writtenFiles = new Map<string, string>();
  /** The file the open dialog answers with; undefined acts as Cancel. */
  pickedFile: WorkspaceFileContents | undefined;
  startupFile: WorkspaceFileContents | undefined;
  private readonly listeners = new Set<WorkspaceFileListener>();
  private chosenPath: string | undefined;

  chooseExportPlace(): Promise<{ readonly folder: string } | undefined> {
    if (this.exportFolder === undefined) return Promise.resolve(undefined);
    this.chosenPath = `${this.exportFolder}\\${this.exportFileName}`;
    return Promise.resolve({ folder: this.exportFolder });
  }

  writeExport(text: string): Promise<string> {
    const path = this.chosenPath;
    this.chosenPath = undefined;
    if (path === undefined) return Promise.reject(new Error('No place was chosen'));
    this.writtenFiles.set(path, text);
    return Promise.resolve(path);
  }

  openWorkspaceFile(): Promise<WorkspaceFileContents | undefined> {
    return Promise.resolve(this.pickedFile);
  }

  takeStartupWorkspaceFile(): Promise<WorkspaceFileContents | undefined> {
    const file = this.startupFile;
    this.startupFile = undefined;
    return Promise.resolve(file);
  }

  onWorkspaceFileOpened(listener: WorkspaceFileListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Acts as a double-click on a workspace file while the app runs. */
  openFromWindows(contents: WorkspaceFileContents): void {
    for (const listener of this.listeners) listener(contents);
  }
}
