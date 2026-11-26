import type { InjectionCheckRequest, InjectionCheckResult } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { checkInjectionText } from './checkInjectionText';
import { InjectionChecker, WORKER_THRESHOLD_LENGTH, type ProjectFile } from './InjectionChecker';
import type { InjectionCheckWorker } from './InjectionCheckWorker';

/** Checks in the same thread, but only when the test lets it finish. */
class FakeWorker implements InjectionCheckWorker {
  readonly requests: InjectionCheckRequest[] = [];
  isTerminated = false;
  private readonly waiting: (() => void)[] = [];

  check(request: InjectionCheckRequest): Promise<InjectionCheckResult | undefined> {
    this.requests.push(request);
    return new Promise((resolve) => {
      this.waiting.push(() => {
        resolve(this.isTerminated ? undefined : checkInjectionText(request));
      });
    });
  }

  finish(): void {
    for (const resume of this.waiting.splice(0)) resume();
  }

  terminate(): void {
    this.isTerminated = true;
    this.finish();
  }
}

function checkerWithWorkers() {
  const workers: FakeWorker[] = [];
  const checker = new InjectionChecker(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { checker, workers };
}

function request(text: string): InjectionCheckRequest {
  return { text, origin: 'local', trigger: 'manual' };
}

const LARGE_TEXT = `${'a'.repeat(WORKER_THRESHOLD_LENGTH)}\u200B`;

describe('InjectionChecker', () => {
  it('checks a small document in the window without starting a worker', async () => {
    const { checker, workers } = checkerWithWorkers();

    const result = await checker.checkDocument(request('ign\u200Bore'));

    expect(result?.findings.map((finding) => finding.ruleId)).toEqual(['char-zero-width']);
    expect(workers).toEqual([]);
  });

  it('checks a document above 256 KB in a worker and stops the worker once it is idle', async () => {
    const { checker, workers } = checkerWithWorkers();

    const checking = checker.checkDocument(request(LARGE_TEXT));
    workers[0]?.finish();
    const result = await checking;

    expect(workers).toHaveLength(1);
    expect(result?.findings).toHaveLength(1);
    expect(workers[0]?.isTerminated).toBe(true);
  });

  it('cancels a running check when a new one starts, and stops its worker', async () => {
    const { checker, workers } = checkerWithWorkers();

    const firstCheck = checker.checkDocument(request(LARGE_TEXT));
    const secondCheck = checker.checkDocument(request('plain'));

    expect(await firstCheck).toBeUndefined();
    expect(workers[0]?.isTerminated).toBe(true);
    expect((await secondCheck)?.findings).toEqual([]);
  });

  it('drops the result of a check cancelled while it ran', async () => {
    const { checker, workers } = checkerWithWorkers();

    const checking = checker.checkDocument(request(LARGE_TEXT));
    checker.cancel();

    expect(await checking).toBeUndefined();
    expect(workers[0]?.isTerminated).toBe(true);
  });

  it('checks the files of a project one at a time, each as agent context, with its count and highest severity', async () => {
    const { checker } = checkerWithWorkers();
    let filesBeingRead = 0;
    let mostAtOnce = 0;
    const file = (location: string, text: string): ProjectFile => ({
      location,
      readText: async () => {
        filesBeingRead += 1;
        mostAtOnce = Math.max(mostAtOnce, filesBeingRead);
        await Promise.resolve();
        filesBeingRead -= 1;
        return text;
      },
    });

    const summaries = await checker.checkDocuments([
      file('c:\\spec\\proposal.md', 'Hidden\u{E0068}\u{E0069}'),
      file('c:\\spec\\tasks.md', '# Tasks\n\nPlain.'),
    ]);

    expect(summaries).toEqual([
      { location: 'c:\\spec\\proposal.md', findingCount: 1, highestSeverity: 'high' },
      { location: 'c:\\spec\\tasks.md', findingCount: 0 },
    ]);
    expect(mostAtOnce).toBe(1);
  });

  it('leaves ignored findings out of a project summary', async () => {
    const { checker } = checkerWithWorkers();
    const location = 'c:\\spec\\notes.md';
    const ignoreEntries = [
      {
        ruleId: 'char-zero-width',
        documentKey: location,
        evidenceHash: '',
        scope: 'ruleInDocument',
        createdAt: 1,
      },
    ] as const;

    const summaries = await checker.checkDocuments(
      [{ location, readText: () => Promise.resolve('a\u200Bb') }],
      { ignoreEntries },
    );

    expect(summaries).toEqual([{ location, findingCount: 0 }]);
  });

  it('stops a project check when it is cancelled', async () => {
    const { checker } = checkerWithWorkers();
    const files: ProjectFile[] = [
      { location: 'c:\\spec\\a.md', readText: () => Promise.resolve('a') },
      { location: 'c:\\spec\\b.md', readText: () => Promise.resolve('b') },
    ];

    const checking = checker.checkDocuments(files);
    checker.cancel();

    expect(await checking).toBeUndefined();
  });
});
