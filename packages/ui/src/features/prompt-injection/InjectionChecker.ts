import {
  filterIgnoredFindings,
  highestSeverityOf,
  Ruleset,
  type IgnoreEntry,
  type InjectionCheckRequest,
  type InjectionCheckResult,
  type InjectionSeverity,
} from '@mdx/core';
import { checkInjectionText } from './checkInjectionText';
import type { InjectionCheckWorker, InjectionCheckWorkerStarter } from './InjectionCheckWorker';

/** 256 KiB: larger documents, counted in UTF-16 code units, are checked in a worker so the window never waits. */
export const WORKER_THRESHOLD_LENGTH = 262_144;

/** A Markdown file of a spec project, read only when its turn comes. */
export interface ProjectFile {
  /** Canonical path: it keys the file's ignore entries. */
  readonly location: string;
  readText(): Promise<string>;
}

export interface ProjectFileSummary {
  readonly location: string;
  readonly findingCount: number;
  /** Absent when the file has no findings. */
  readonly highestSeverity?: InjectionSeverity;
}

export interface ProjectCheckOptions {
  readonly ignoreEntries?: readonly IgnoreEntry[];
}

/**
 * Checks one document at a time: inline when it is small, in a worker started on demand when it is
 * large. A new check cancels the one before it, and the worker is stopped as soon as it is idle.
 */
export class InjectionChecker {
  private generation = 0;
  private worker: InjectionCheckWorker | undefined;

  constructor(private readonly startWorker: InjectionCheckWorkerStarter) {}

  /** Undefined when a newer check or `cancel` took its place before it finished. */
  async checkDocument(request: InjectionCheckRequest): Promise<InjectionCheckResult | undefined> {
    const generation = this.startGeneration();
    try {
      const result = await this.run(request);
      return generation === this.generation ? result : undefined;
    } catch (error) {
      if (generation !== this.generation) return undefined;
      throw error;
    } finally {
      if (generation === this.generation) this.stopWorker();
    }
  }

  /** Checks every file of a spec project in turn, each as agent context; undefined when cancelled. */
  async checkDocuments(
    files: readonly ProjectFile[],
    { ignoreEntries = [] }: ProjectCheckOptions = {},
  ): Promise<ProjectFileSummary[] | undefined> {
    const generation = this.startGeneration();
    const summaries: ProjectFileSummary[] = [];
    for (const file of files) {
      const text = await file.readText();
      if (generation !== this.generation) return undefined;
      const result = await this.run(projectFileRequest(file, text));
      if (generation !== this.generation || !result) return undefined;
      summaries.push(
        summaryOf(
          file.location,
          filterIgnoredFindings(result, ignoreEntries, {
            text,
            documentKey: file.location,
            ruleset: Ruleset.bundled(),
          }).result,
        ),
      );
    }
    this.stopWorker();
    return summaries;
  }

  /** Abandons the running check; a busy worker is stopped at once. */
  cancel(): void {
    this.generation += 1;
    this.stopWorker();
  }

  private startGeneration(): number {
    this.cancel();
    return this.generation;
  }

  private async run(request: InjectionCheckRequest): Promise<InjectionCheckResult | undefined> {
    if (request.text.length <= WORKER_THRESHOLD_LENGTH) return checkInjectionText(request);
    this.worker ??= this.startWorker();
    return this.worker.check(request);
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }
}

function projectFileRequest(file: ProjectFile, text: string): InjectionCheckRequest {
  return { text, origin: 'local', location: file.location, isAgentContext: true, trigger: 'manual' };
}

function summaryOf(location: string, result: InjectionCheckResult): ProjectFileSummary {
  const highestSeverity = highestSeverityOf(result.findings.map((finding) => finding.severity));
  return {
    location,
    findingCount: result.findings.length,
    ...(highestSeverity === undefined ? {} : { highestSeverity }),
  };
}
