import type { JumpListAnswer, JumpListPort, JumpListWorkspace } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriJumpList implements JumpListPort {
  showRecentWorkspaces(category: string, workspaces: readonly JumpListWorkspace[]): Promise<JumpListAnswer> {
    return tauriCommands.showJumpListWorkspaces(category, workspaces);
  }
}
