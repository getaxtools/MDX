import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { DocumentOpenError } from '@mdx/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('asks to follow a linked folder through its command', async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      return true;
    });
    const isFollowed = await new TauriSpecProjects().followLink(ROOT, 'openspec');

    expect(isFollowed).toBe(true);
    expect(calls).toEqual([
      { command: 'follow_spec_project_link', args: { link: { root: ROOT, linkPath: 'openspec' } } },
    ]);
  });

  it('searches the documents of a project through its command', async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      return { documents: [], isIncomplete: false };
    });
    const options = { isCaseSensitive: true, isWholeWord: false };

    await new TauriSpecProjects().searchProjectDocuments(
      { root: ROOT, relativePaths: ['.specify/memory/constitution.md'] },
      'pin',
      options,
    );

    expect(calls).toEqual([
      {
        command: 'search_spec_project_documents',
        args: {
          documents: { root: ROOT, relativePaths: ['.specify/memory/constitution.md'] },
          query: 'pin',
          options,
        },
      },
    ]);
  });

  it('watches project folders and passes on their changes', async () => {
    mockWindows('main');
    const calls: { command: string; args: unknown }[] = [];
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        return null;
      },
      { shouldMockEvents: true },
    );
    const specProjects = new TauriSpecProjects();
    const listener = vi.fn();
    const stop = specProjects.onProjectsChanged(listener);

    const projects = [{ root: ROOT, followedLinks: ['openspec'] }];
    await specProjects.watchProjects(projects, ['GEMINI.md']);
    await vi.waitFor(async () => {
      await emit('spec-projects-changed', [ROOT]);
      expect(listener).toHaveBeenCalledWith([ROOT]);
    });
    stop();

    expect(calls[0]).toEqual({
      command: 'watch_spec_projects',
      args: { projects, additionalLocations: ['GEMINI.md'] },
    });
  });

  it('listens for changed projects in this window only, not in every window', async () => {
    mockWindows('window-2');
    const listens: unknown[] = [];
    mockIPC((command, args) => {
      if (command === 'plugin:event|listen') listens.push(args);
      return 1;
    });

    const stop = new TauriSpecProjects().onProjectsChanged(vi.fn());

    await vi.waitFor(() =>
      expect(listens).toEqual([
        expect.objectContaining({
          event: 'spec-projects-changed',
          target: { kind: 'WebviewWindow', label: 'window-2' },
        }),
      ]),
    );
    stop();
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
    await expect(specProjects.followLink(ROOT, 'openspec')).rejects.toEqual(
      new DocumentOpenError('accessDenied', 'openspec'),
    );
  });
});
