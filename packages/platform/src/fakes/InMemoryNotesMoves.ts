import type { DocumentLocation } from '../DocumentLocation';
import {
  NotesMoveError,
  type KeptFiles,
  type NotesMovePlan,
  type NotesMovePort,
  type NotesMoveProblem,
  type NotesMoveProgress,
  type NotesMoveRequest,
  type NotesMoveState,
  type OldCopyRemoval,
  type OldNotesCopy,
  type UnfinishedNotesMove,
} from '../NotesMovePort';

interface FakeMove {
  readonly request: NotesMoveRequest;
  state: NotesMoveState;
}

/** Moves nothing on disk; tests set what each step answers and read what was asked. */
export class InMemoryNotesMoves implements NotesMovePort {
  plan: NotesMovePlan = {
    fileCount: 3,
    totalBytes: 1_200,
    onlineOnlyCount: 0,
    onlineOnlyBytes: 0,
    availableBytes: 1_000_000,
  };
  /** Refuses the next plan with this problem. */
  planProblem: NotesMoveProblem | undefined;
  /** Stops the next run with this problem, as a full drive would. */
  runProblem: NotesMoveProblem | undefined;
  /** Holds runs until `finishRun` is called, so a test can look at a move while it runs. */
  isHoldingRuns = false;
  removal: OldCopyRemoval = { recycledCount: 3, kept: { paths: [], count: 0 }, hasNoRecycleBin: false };
  cancelKept: KeptFiles = { paths: [], count: 0 };
  readonly unfinished: UnfinishedNotesMove[] = [];
  readonly calls: string[] = [];
  private readonly moves = new Map<string, FakeMove>();
  private readonly listeners = new Set<(progress: NotesMoveProgress) => void>();
  private heldRun: (() => void) | undefined;

  planMove(request: NotesMoveRequest): Promise<NotesMovePlan> {
    this.calls.push(`plan ${request.target}`);
    const problem = this.planProblem;
    this.planProblem = undefined;
    if (problem) return Promise.reject(new NotesMoveError(problem));
    this.moves.set(request.locationId, { request, state: 'planned' });
    return Promise.resolve(this.plan);
  }

  async runMove(locationId: string): Promise<void> {
    this.calls.push(`run ${locationId}`);
    const move = this.moveOf(locationId);
    move.state = 'copying';
    if (this.isHoldingRuns) await new Promise<void>((resolve) => (this.heldRun = resolve));
    const problem = this.runProblem;
    this.runProblem = undefined;
    if (problem) throw new NotesMoveError(problem);
    this.report({ locationId, phase: 'verifying', doneFiles: 3, totalFiles: 3 });
    move.state = 'verified';
  }

  /** Lets a held run go on. */
  finishRun(): void {
    this.heldRun?.();
    this.heldRun = undefined;
  }

  stopMove(): Promise<void> {
    this.calls.push('stop');
    this.runProblem = { code: 'stopped' };
    this.finishRun();
    return Promise.resolve();
  }

  cancelMove(locationId: string): Promise<KeptFiles> {
    this.calls.push(`cancel ${locationId}`);
    this.moves.delete(locationId);
    this.removeUnfinished(locationId);
    return Promise.resolve(this.cancelKept);
  }

  switchMove(locationId: string): Promise<DocumentLocation> {
    this.calls.push(`switch ${locationId}`);
    const move = this.moveOf(locationId);
    if (move.state !== 'verified') return Promise.reject(new NotesMoveError({ code: 'wrongState' }));
    const { target } = move.request;
    const fileName = target.split('\\').filter(Boolean).at(-1) ?? target;
    return Promise.resolve({ canonicalKey: target.toLowerCase(), displayPath: target, fileName });
  }

  finishSwitch(locationId: string): Promise<OldNotesCopy> {
    this.calls.push(`finish ${locationId}`);
    const move = this.moveOf(locationId);
    move.state = 'switched';
    return Promise.resolve({
      locationId,
      path: move.request.source,
      fileCount: this.plan.fileCount,
      totalBytes: this.plan.totalBytes,
    });
  }

  unfinishedMoves(): Promise<readonly UnfinishedNotesMove[]> {
    for (const move of this.unfinished) {
      const request = { ...move, source: move.path };
      this.moves.set(move.locationId, { request, state: move.state });
    }
    return Promise.resolve([...this.unfinished]);
  }

  keepOldCopy(locationId: string): Promise<void> {
    this.calls.push(`keep ${locationId}`);
    this.moves.delete(locationId);
    this.removeUnfinished(locationId);
    return Promise.resolve();
  }

  removeOldCopy(locationId: string): Promise<OldCopyRemoval> {
    this.calls.push(`remove ${locationId}`);
    this.moves.delete(locationId);
    this.removeUnfinished(locationId);
    return Promise.resolve(this.removal);
  }

  clearMoves(): Promise<void> {
    this.calls.push('clear');
    this.moves.clear();
    this.unfinished.splice(0);
    return Promise.resolve();
  }

  onProgress(listener: (progress: NotesMoveProgress) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  report(progress: NotesMoveProgress): void {
    for (const listener of this.listeners) listener(progress);
  }

  private moveOf(locationId: string): FakeMove {
    const move = this.moves.get(locationId);
    if (!move) throw new NotesMoveError({ code: 'noMove' });
    return move;
  }

  private removeUnfinished(locationId: string): void {
    const index = this.unfinished.findIndex((move) => move.locationId === locationId);
    if (index >= 0) this.unfinished.splice(index, 1);
  }
}
