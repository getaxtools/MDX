import { describe, expect, it } from 'vitest';
import { InMemoryDocumentRequests } from './InMemoryDocumentRequests';

describe('InMemoryDocumentRequests', () => {
  it('hands out startup documents only once', async () => {
    const requests = new InMemoryDocumentRequests(['a.md']);

    expect(await requests.takeStartupDocuments()).toEqual(['a.md']);
    expect(await requests.takeStartupDocuments()).toEqual([]);
  });

  it('notifies listeners until they unsubscribe', () => {
    const requests = new InMemoryDocumentRequests();
    const received: (readonly string[])[] = [];
    const unsubscribe = requests.onDocumentsRequested((paths) => received.push(paths));

    requests.requestDocuments(['a.md']);
    unsubscribe();
    requests.requestDocuments(['b.md']);

    expect(received).toEqual([['a.md']]);
    expect(requests.listenerCount()).toBe(0);
  });

  it('returns the configured picked documents', async () => {
    const requests = new InMemoryDocumentRequests();
    requests.pickedPaths = ['picked.md'];

    expect(await requests.pickDocuments()).toEqual(['picked.md']);
  });
});
