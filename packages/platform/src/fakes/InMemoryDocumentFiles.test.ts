import { describe, expect, it } from 'vitest';
import { DocumentOpenError } from '../DocumentOpenError';
import { InMemoryDocumentFiles } from './InMemoryDocumentFiles';

describe('InMemoryDocumentFiles', () => {
  it('opens a stored document with its location', async () => {
    const files = new InMemoryDocumentFiles({ 'C:\\Docs\\Guide.md': '# Guide' });

    const opened = await files.open('C:\\Docs\\Guide.md');

    expect(opened.text).toBe('# Guide');
    expect(opened.location).toEqual({
      canonicalKey: 'c:\\docs\\guide.md',
      displayPath: 'C:\\Docs\\Guide.md',
      fileName: 'Guide.md',
    });
  });

  it('treats paths that differ only by case as the same document', async () => {
    const files = new InMemoryDocumentFiles({ 'C:\\Docs\\Guide.md': '# Guide' });

    const opened = await files.open('c:\\docs\\GUIDE.md');

    expect(opened.text).toBe('# Guide');
  });

  it('rejects a missing document with a notFound error', async () => {
    const files = new InMemoryDocumentFiles();

    await expect(files.open('C:\\missing.md')).rejects.toMatchObject({ failure: 'notFound' });
  });

  it('rejects an unreachable document with an unreachable error', async () => {
    const files = new InMemoryDocumentFiles({ '\\\\server\\share\\a.md': 'a' });
    files.makeUnreachable('\\\\server\\share\\a.md');

    const failure = files.open('\\\\server\\share\\a.md');

    await expect(failure).rejects.toBeInstanceOf(DocumentOpenError);
    await expect(failure).rejects.toMatchObject({ messageKey: 'errors.document.unreachable' });
  });

  it('saves edited text unless another program changed the file since it was read', async () => {
    const files = new InMemoryDocumentFiles({ 'a.md': 'old' });
    const opened = await files.open('a.md');
    const save = {
      path: 'a.md',
      text: 'new',
      encoding: 'utf-8',
      hasByteOrderMark: false,
      expectedModifiedAtMs: opened.modifiedAtMs,
      shouldOverwriteChangesOnDisk: false,
    };

    const modifiedAtMs = await files.save(save);
    const refused = files.save({ ...save, text: 'stale' });

    expect(modifiedAtMs).toBeGreaterThan(opened.modifiedAtMs);
    await expect(refused).rejects.toMatchObject({ failure: 'changedOnDisk' });
    expect(files.textOf('a.md')).toBe('new');
  });

  it('reports the line endings of a document', async () => {
    const files = new InMemoryDocumentFiles({ 'a.md': 'a\r\nb', 'b.md': 'a\nb', 'c.md': 'a\r\nb\nc' });

    const lineEndings = await Promise.all(
      ['a.md', 'b.md', 'c.md'].map(async (path) => (await files.open(path)).lineEnding),
    );

    expect(lineEndings).toEqual(['crlf', 'lf', 'mixed']);
  });

  it('reports available, missing and unreachable statuses', async () => {
    const files = new InMemoryDocumentFiles({ 'a.md': 'a', 'b.md': 'b' });
    files.makeUnreachable('b.md');
    const locations = ['a.md', 'b.md', 'c.md'].map((path) => InMemoryDocumentFiles.locationOf(path));

    const statuses = await files.checkPathStatuses(locations);

    expect([...statuses.values()]).toEqual(['available', 'unreachable', 'missing']);
  });
});
