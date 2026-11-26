import type { WorkspaceFileContents, WorkspaceFileListener, WorkspaceFilePort } from '@mdx/platform';
import { OPEN_WORKSPACE_FILE_EVENT, tauriCommands } from './tauriCommands';
import { listenInThisWindow } from './windowEvents';

export class TauriWorkspaceFiles implements WorkspaceFilePort {
  async chooseExportPlace(suggestedFileName: string): Promise<{ readonly folder: string } | undefined> {
    return (await tauriCommands.pickWorkspaceExportPlace(suggestedFileName)) ?? undefined;
  }

  writeExport(text: string): Promise<string> {
    return tauriCommands.writeWorkspaceExport(text);
  }

  async openWorkspaceFile(): Promise<WorkspaceFileContents | undefined> {
    return (await tauriCommands.openWorkspaceFile()) ?? undefined;
  }

  async takeStartupWorkspaceFile(): Promise<WorkspaceFileContents | undefined> {
    return (await tauriCommands.takeStartupWorkspaceFile()) ?? undefined;
  }

  onWorkspaceFileOpened(listener: WorkspaceFileListener): () => void {
    return listenInThisWindow<WorkspaceFileContents>(OPEN_WORKSPACE_FILE_EVENT, (event) =>
      listener(event.payload),
    );
  }
}
