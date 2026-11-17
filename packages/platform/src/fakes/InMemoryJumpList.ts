import type { JumpListOutcome, JumpListPort, JumpListUpdate, JumpListWorkspace } from '../JumpListPort';

/** A Jump List that keeps what it was asked to show; it can answer as a privacy setting or a failure would. */
export class InMemoryJumpList implements JumpListPort {
  outcome: JumpListOutcome = 'written';
  isFailing = false;
  /** Workspaces the user removed from the list, reported by the next update. */
  removedWorkspaceIds: string[] = [];
  /** While held, updates wait until `release` is called, as a slow taskbar would make them. */
  isHeld = false;
  readonly shownLists: { readonly category: string; readonly workspaces: readonly JumpListWorkspace[] }[] =
    [];
  /** The most updates that ran at the same time. */
  mostAtOnce = 0;
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  async showRecentWorkspaces(
    category: string,
    workspaces: readonly JumpListWorkspace[],
  ): Promise<JumpListUpdate> {
    this.running += 1;
    this.mostAtOnce = Math.max(this.mostAtOnce, this.running);
    try {
      if (this.isHeld) await new Promise<void>((resolve) => this.waiting.push(resolve));
      this.shownLists.push({ category, workspaces });
      if (this.isFailing) throw new Error('The Jump List could not be written');
      const removedWorkspaceIds = this.removedWorkspaceIds.splice(0);
      return { outcome: this.outcome, removedWorkspaceIds };
    } finally {
      this.running -= 1;
    }
  }

  release(): void {
    this.isHeld = false;
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}
