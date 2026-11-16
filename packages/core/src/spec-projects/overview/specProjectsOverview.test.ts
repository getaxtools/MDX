import type { SpecProjectManifest } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { activeTaskDocumentsOf, specProjectsOverview } from './specProjectsOverview';

const ROOT = 'C:\\Projects\\shop';

function manifestOf(
  paths: readonly string[],
  extra: Partial<Pick<SpecProjectManifest, 'folders' | 'links' | 'files'>> = {},
): SpecProjectManifest {
  return {
    root: { canonicalKey: ROOT.toLowerCase(), displayPath: ROOT, fileName: 'shop' },
    folders: extra.folders ?? [],
    files: extra.files ?? paths.map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null })),
    links: extra.links ?? [],
    isIncomplete: false,
  };
}

const PROJECT = [
  'openspec/config.yaml',
  'openspec/specs/tabs/spec.md',
  'openspec/specs/identity/user-auth/spec.md',
  'openspec/changes/add-pins/proposal.md',
  'openspec/changes/add-pins/tasks.md',
  'openspec/changes/add-pins/specs/tabs/spec.md',
  'openspec/changes/archive/2026-10-01-add-tabs/proposal.md',
  'openspec/changes/archive/2026-11-02-add-search/proposal.md',
  'GEMINI.md',
  'packages/api/GEMINI.md',
];

describe('specProjectsOverview', () => {
  it('lists capabilities by their path', () => {
    const [project] = specProjectsOverview(manifestOf(PROJECT));

    expect(project?.capabilities).toEqual([
      { name: 'identity/user-auth', path: 'openspec/specs/identity/user-auth/spec.md' },
      { name: 'tabs', path: 'openspec/specs/tabs/spec.md' },
    ]);
  });

  it('lists active changes with their documents and the archive newest first', () => {
    const [project] = specProjectsOverview(manifestOf(PROJECT));

    expect(project?.activeChanges).toEqual([
      {
        name: 'add-pins',
        folder: 'openspec/changes/add-pins',
        archivedOn: undefined,
        documents: {
          proposal: 'openspec/changes/add-pins/proposal.md',
          design: undefined,
          tasks: 'openspec/changes/add-pins/tasks.md',
          deltas: [{ name: 'tabs', path: 'openspec/changes/add-pins/specs/tabs/spec.md' }],
        },
        progress: undefined,
      },
    ]);
    expect(project?.archivedChanges.map((change) => [change.name, change.archivedOn])).toEqual([
      ['add-search', '2026-11-02'],
      ['add-tabs', '2026-10-01'],
    ]);
  });

  it('counts task progress from the tasks documents read so far', () => {
    const taskTexts = new Map([['openspec/changes/add-pins/tasks.md', '- [x] 1.1\n- [ ] 1.2\n- [ ] 1.3']]);

    const [project] = specProjectsOverview(manifestOf(PROJECT), taskTexts);

    expect(project?.activeChanges[0]?.progress).toEqual({ done: 1, total: 3 });
    expect(activeTaskDocumentsOf(specProjectsOverview(manifestOf(PROJECT)))).toEqual([
      'openspec/changes/add-pins/tasks.md',
    ]);
  });

  it('lists root and nested agent instruction files with their folder', () => {
    const [project] = specProjectsOverview(manifestOf(PROJECT));

    expect(project?.agentInstructions).toEqual([{ name: 'GEMINI.md', path: 'GEMINI.md' }]);
  });

  it('names the planning store and lists no changes when the specs live there', () => {
    const manifest = manifestOf([], {
      folders: ['openspec'],
      files: [{ path: 'openspec/config.yaml', sizeBytes: 1, modifiedAtMs: 1, text: 'store: team-plans' }],
    });

    const [project] = specProjectsOverview(manifest);

    expect(project).toMatchObject({ planningStore: 'team-plans', capabilities: [], activeChanges: [] });
  });

  it('marks the linked folders of a project', () => {
    const manifest = manifestOf(PROJECT, { links: [{ path: 'openspec', isFollowed: false }] });

    expect(specProjectsOverview(manifest)[0]?.linkedFolders).toEqual([
      { path: 'openspec', isFollowed: false },
    ]);
  });

  it('shows a root whose only spec folder is a link not followed yet', () => {
    const manifest = manifestOf([], { links: [{ path: 'openspec', isFollowed: false }] });

    expect(specProjectsOverview(manifest)).toEqual([
      expect.objectContaining({
        name: 'shop',
        layouts: [],
        linkedFolders: [{ path: 'openspec', isFollowed: false }],
      }),
    ]);
  });

  it('labels each project with its layouts', () => {
    const projects = specProjectsOverview(manifestOf([...PROJECT, '.specify/memory/constitution.md']));

    expect(projects.map((project) => [project.name, project.layouts])).toEqual([
      ['shop', ['changeBased', 'featureNumbered']],
    ]);
  });
});
