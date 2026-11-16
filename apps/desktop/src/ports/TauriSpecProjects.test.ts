import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { DocumentOpenError } from '@mdx/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriSpecProjects } from './TauriSpecProjects';

const ROOT = 'C:\\Projects\\shop';

afterEach(() => clearMocks());

describe('TauriSpecProjects', () => {
  it('scans a project and reads its files through their commands', async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      return command === 'scan_spec_project' ? { files: [] } : { text: '# Tabs' };
    });
    const specProjects = new TauriSpecProjects();

    await specProjects.scanProject(ROOT, ['GEMINI.md']);
    const file = await specProjects.readProjectFile(ROOT, 'openspec/specs/tabs/spec.md');

    expect(file.text).toBe('# Tabs');
    expect(calls).toEqual([
      { command: 'scan_spec_project', args: { root: ROOT, additionalLocations: ['GEMINI.md'] } },
      {
        command: 'read_spec_project_file',
        args: { root: ROOT, relativePath: 'openspec/specs/tabs/spec.md' },
      },
    ]);
  });

  it('turns a refused request into a typed error', async () => {
    mockIPC(() => {
      throw Object.assign(new Error('backend error'), { code: 'accessDenied' });
    });
    const specProjects = new TauriSpecProjects();

    await expect(specProjects.scanProject(ROOT, [])).rejects.toEqual(
      new DocumentOpenError('accessDenied', ROOT),
    );
    await expect(specProjects.readProjectFile(ROOT, 'specs/a.md')).rejects.toEqual(
      new DocumentOpenError('accessDenied', 'specs/a.md'),
    );
  });
});
