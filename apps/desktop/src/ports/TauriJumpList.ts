import type { JumpListPort, JumpListUpdate, JumpListWorkspace } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriJumpList implements JumpListPort {
  showRecentWorkspaces(category: string, workspaces: readonly JumpListWorkspace[]): Promise<JumpListUpdate> {
    return tauriCommands.showJumpListWorkspaces(category, workspaces);
  }
}
