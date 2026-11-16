import type { SpecProjectManifest } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import {
  activeTaskDocumentsOf,
  changeStatusOf,
  specProjectsOverview,
  type ChangeSummary,
} from './specProjectsOverview';

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
        created: undefined,
        schema: undefined,
        isSkippingSpecs: false,
        otherDocuments: [],
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

  it('lists the other Markdown documents of a change', () => {
    const [project] = specProjectsOverview(
      manifestOf([...PROJECT, 'openspec/changes/add-pins/notes/research.md']),
    );

    expect(project?.activeChanges[0]?.otherDocuments).toEqual([
      { name: 'notes/research.md', path: 'openspec/changes/add-pins/notes/research.md' },
    ]);
  });

  it('reads the creation day from the change metadata', () => {
    const files = [
      ...PROJECT.map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null })),
      {
        path: 'openspec/changes/add-pins/.openspec.yaml',
        sizeBytes: 1,
        modifiedAtMs: 1,
        text: 'schema: spec-driven\ncreated: 2026-11-12\n',
      },
    ];

    const [project] = specProjectsOverview(manifestOf([], { files }));

    expect(project?.activeChanges[0]?.created).toBe('2026-11-12');
    expect(project?.activeChanges[0]?.schema).toBe('spec-driven');
  });
});

describe('changeStatusOf', () => {
  const change = (progress?: { done: number; total: number }, archivedOn?: string): ChangeSummary => ({
    name: 'add-pins',
    folder: 'openspec/changes/add-pins',
    archivedOn,
    documents: { deltas: [] },
    progress,
  });

  it.each([
    ['noTasks', change()],
    ['noTasks', change({ done: 0, total: 0 })],
    ['notStarted', change({ done: 0, total: 8 })],
    ['inProgress', change({ done: 3, total: 8 })],
    ['tasksComplete', change({ done: 5, total: 5 })],
    ['archived', change({ done: 5, total: 5 }, '2026-10-01')],
  ])('is %s', (status, summary) => {
    expect(changeStatusOf(summary)).toBe(status);
  });
});

describe('feature-numbered projects', () => {
  const files = [
    '.specify/memory/constitution.md',
    '.specify/templates/spec-template.md',
    '.specify/bugs/login/report.md',
    'specs/001-photo-albums/spec.md',
    'specs/001-photo-albums/tasks.md',
    'specs/002-sharing/spec.md',
    'specs/002-sharing/plan.md',
    'specs/002-sharing/contracts/api.yaml',
  ].map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null }));
  const featureFile = {
    path: '.specify/feature.json',
    sizeBytes: 1,
    modifiedAtMs: 1,
    text: '{"feature": "002-sharing"}',
  };
  const texts = new Map([
    [
      'specs/001-photo-albums/spec.md',
      '**Status**: Draft\n[NEEDS CLARIFICATION: a]\n[NEEDS CLARIFICATION: b]',
    ],
    ['specs/001-photo-albums/tasks.md', '## Phase 1: Setup\n- [X] T010 [P] [US1] A\n- [ ] T011 [US1] B'],
  ]);

  function featuresOf(withFeatureFile: boolean) {
    const manifest = manifestOf([], { files: withFeatureFile ? [...files, featureFile] : files });
    return specProjectsOverview(manifest, texts)[0]?.features ?? [];
  }

  it('lists features with their status and the current one', () => {
    const features = featuresOf(true);

    expect(features.map((feature) => [feature.name, feature.isCurrent, feature.status])).toEqual([
      ['001-photo-albums', false, 'Draft'],
      ['002-sharing', true, undefined],
    ]);
  });

  it('counts clarifications and task progress per story, and lists contracts', () => {
    const [first, second] = featuresOf(false);

    expect(first?.clarifications).toHaveLength(2);
    expect(first?.tasks?.stories).toEqual([{ name: 'US1', done: 1, total: 2 }]);
    expect(first?.progress).toEqual({ done: 1, total: 2 });
    expect(second?.documents.contracts).toEqual(['specs/002-sharing/contracts/api.yaml']);
  });

  it('lists the constitution and other reports, but not the templates', () => {
    const [project] = specProjectsOverview(manifestOf([], { files }), texts);

    expect(project?.constitution).toBe('.specify/memory/constitution.md');
    expect(project?.reports).toEqual([
      { name: 'bugs/login/report.md', path: '.specify/bugs/login/report.md' },
    ]);
  });

  it('reads the feature documents for their status and clarifications', () => {
    const [project] = specProjectsOverview(manifestOf([], { files }));

    expect(activeTaskDocumentsOf(project ? [project] : [])).toEqual([
      'specs/001-photo-albums/spec.md',
      'specs/001-photo-albums/tasks.md',
      'specs/002-sharing/spec.md',
      'specs/002-sharing/plan.md',
    ]);
  });
});
