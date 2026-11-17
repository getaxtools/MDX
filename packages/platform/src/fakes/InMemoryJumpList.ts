import type { JumpListAnswer, JumpListPort, JumpListWorkspace } from '../JumpListPort';

/** A Jump List that keeps what it was asked to show; it can answer as a privacy setting or a failure would. */
export class InMemoryJumpList implements JumpListPort {
  answer: JumpListAnswer = 'written';
  isFailing = false;
  readonly shownLists: { readonly category: string; readonly workspaces: readonly JumpListWorkspace[] }[] =
    [];

  showRecentWorkspaces(category: string, workspaces: readonly JumpListWorkspace[]): Promise<JumpListAnswer> {
    this.shownLists.push({ category, workspaces });
    if (this.isFailing) return Promise.reject(new Error('The Jump List could not be written'));
    return Promise.resolve(this.answer);
  }
}
