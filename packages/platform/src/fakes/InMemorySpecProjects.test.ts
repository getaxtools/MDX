import { describe, expect, it } from 'vitest';
import { DocumentOpenError } from '../DocumentOpenError';
import { InMemorySpecProjects } from './InMemorySpecProjects';

const ROOT = 'C:\\Projects\\shop';

describe('InMemorySpecProjects', () => {
  it('lists the files of a project with their folders and configuration text', async () => {
    const specProjects = new InMemorySpecProjects({
      [ROOT]: {
        files: { 'openspec/specs/tabs/spec.md': '# Tabs', 'openspec/config.yaml': 'schema: spec-driven' },
        emptyFolders: ['openspec/changes'],
      },
    });

    const manifest = await specProjects.scanProject(ROOT);

    expect(manifest.root.displayPath).toBe(ROOT);
    expect(manifest.folders).toEqual([
      'openspec',
      'openspec/changes',
      'openspec/specs',
      'openspec/specs/tabs',
    ]);
    expect(manifest.files).toEqual([
      { path: 'openspec/config.yaml', sizeBytes: 19, modifiedAtMs: 2, text: 'schema: spec-driven' },
      { path: 'openspec/specs/tabs/spec.md', sizeBytes: 6, modifiedAtMs: 1, text: null },
    ]);
    expect(manifest.isIncomplete).toBe(false);
  });

  it('stops at the file limit and says the scan is incomplete', async () => {
    const specProjects = new InMemorySpecProjects({
      [ROOT]: { files: { 'specs/a.md': '', 'specs/b.md': '', 'specs/c.md': '' } },
    });
    specProjects.maxScannedFiles = 2;

    const manifest = await specProjects.scanProject(ROOT);

    expect(manifest.files.map((file) => file.path)).toEqual(['specs/a.md', 'specs/b.md']);
    expect(manifest.isIncomplete).toBe(true);
  });

  it('refuses a root the user has not chosen', async () => {
    const specProjects = new InMemorySpecProjects();

    await expect(specProjects.scanProject(ROOT)).rejects.toEqual(new DocumentOpenError('accessDenied', ROOT));
    await expect(specProjects.readProjectFile(ROOT, 'specs/a.md')).rejects.toEqual(
      new DocumentOpenError('accessDenied', ROOT),
    );
  });

  it('reads a file and records the read', async () => {
    const specProjects = new InMemorySpecProjects({ [ROOT]: { files: { 'specs/tasks.md': '- [ ] 1\r\n' } } });

    const file = await specProjects.readProjectFile(ROOT, 'specs/tasks.md');

    expect(file).toMatchObject({ text: '- [ ] 1\r\n', lineEnding: 'crlf', modifiedAtMs: 1 });
    expect(file.location.displayPath).toBe('C:\\Projects\\shop\\specs\\tasks.md');
    expect(specProjects.readFiles).toEqual([`${ROOT}|specs/tasks.md`]);
  });

  it('refuses paths that climb out of the root and reports missing files', async () => {
    const specProjects = new InMemorySpecProjects({ [ROOT]: { files: {} } });

    await expect(specProjects.readProjectFile(ROOT, '../secret.md')).rejects.toEqual(
      new DocumentOpenError('invalidRequest', '../secret.md'),
    );
    await expect(specProjects.readProjectFile(ROOT, 'specs/gone.md')).rejects.toEqual(
      new DocumentOpenError('notFound', 'specs/gone.md'),
    );
  });

  it('lists a file another program changed with a later modified time', async () => {
    const specProjects = new InMemorySpecProjects({ [ROOT]: { files: { 'specs/tasks.md': '- [ ] 1' } } });

    specProjects.writeFile(ROOT, 'specs/tasks.md', '- [x] 1');
    const manifest = await specProjects.scanProject(ROOT);

    expect(manifest.files).toEqual([{ path: 'specs/tasks.md', sizeBytes: 7, modifiedAtMs: 2, text: null }]);
  });
});
