import type { InjectionCheckRequest, InjectionCheckResult } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';

/** A started worker as the checker uses it; tests use a fake that checks in the same thread. */
export interface InjectionCheckWorker {
  /** Undefined when the worker was stopped before it finished. */
  check(request: InjectionCheckRequest): Promise<InjectionCheckResult | undefined>;
  /** Stops the worker at once, abandoning any check it is running. */
  terminate(): void;
}

export type InjectionCheckWorkerStarter = () => InjectionCheckWorker;

export interface WorkerCheckRequest {
  readonly id: number;
  readonly request: InjectionCheckRequest;
}

export type WorkerCheckResponse =
  | { readonly id: number; readonly outcome: 'checked'; readonly result: InjectionCheckResult }
  | { readonly id: number; readonly outcome: 'failed' };

/** The worker stopped with an error, so the document could not be checked. */
export class InjectionCheckFailedError extends Error {
  readonly messageKey: MessageKey = 'promptInjection.panel.failed';

  constructor() {
    super('The prompt injection check did not finish');
    this.name = 'InjectionCheckFailedError';
  }
}

interface PendingCheck {
  readonly resolve: (result: InjectionCheckResult | undefined) => void;
  readonly reject: (error: InjectionCheckFailedError) => void;
}

/** Starts the check worker, emitted by the build as a same-origin module file, so the CSP needs no change. */
export function startModuleWorker(): InjectionCheckWorker {
  const worker = new Worker(new URL('./injectionCheckWorkerScript.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, PendingCheck>();
  let lastId = 0;
  worker.addEventListener('message', (event: MessageEvent<WorkerCheckResponse>) => {
    const response = event.data;
    const check = pending.get(response.id);
    pending.delete(response.id);
    if (response.outcome === 'checked') check?.resolve(response.result);
    else check?.reject(new InjectionCheckFailedError());
  });
  worker.addEventListener('error', () => {
    for (const check of pending.values()) check.reject(new InjectionCheckFailedError());
    pending.clear();
  });
  return {
    check: (request) =>
      new Promise((resolve, reject) => {
        lastId += 1;
        pending.set(lastId, { resolve, reject });
        worker.postMessage({ id: lastId, request } satisfies WorkerCheckRequest);
      }),
    terminate: () => {
      worker.terminate();
      for (const check of pending.values()) check.resolve(undefined);
      pending.clear();
    },
  };
}
