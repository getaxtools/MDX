import { checkInjectionText } from './checkInjectionText';
import type { WorkerCheckRequest, WorkerCheckResponse } from './InjectionCheckWorker';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerCheckRequest>) => void): void;
  postMessage(message: WorkerCheckResponse): void;
}

// The project's type library describes a window; this module only ever runs as a dedicated worker.
const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener('message', ({ data: { id, request } }) => {
  try {
    workerScope.postMessage({ id, outcome: 'checked', result: checkInjectionText(request) });
  } catch {
    workerScope.postMessage({ id, outcome: 'failed' });
  }
});
