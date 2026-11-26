import type { SpecProjectManifest } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { detectSpecProjects } from './detectSpecProjects';

const ROOT = 'C:\\Projects\\shop';

interface ManifestContents {
  readonly files?: Readonly<Record<string, string | null>>;
  readonly folders?: readonly string[];
}

function manifestOf({ files = {}, folders = [] }: ManifestContents): SpecProjectManifest {
  return {
    root: { canonicalKey: ROOT.toLowerCase(), displayPath: ROOT, fileName: 'shop' },
    folders,
    files: Object.entries(files).map(([path, text]) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text })),
    links: [],
    isIncomplete: false,
  };
}

describe('detectSpecProjects', () => {
  it('detects a change-based project with specs and changes', () => {
    const manifest = manifestOf({
      folders: ['openspec', 'openspec/specs', 'openspec/changes'],
      files: { 'openspec/specs/tabs/spec.md': null },
    });

    expect(detectSpecProjects(manifest)).toEqual([
      { folder: '', name: 'shop', layouts: [{ kind: 'changeBased', folder: 'openspec' }] },
    ]);
  });

  it('detects a change-based project from its configuration alone', () => {
    const manifest = manifestOf({
      folders: ['openspec'],
      files: { 'openspec/config.yml': 'schema: spec-driven' },
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([{ kind: 'changeBased', folder: 'openspec' }]);
  });

  it('does not detect an empty openspec folder', () => {
    expect(detectSpecProjects(manifestOf({ folders: ['openspec'] }))).toEqual([]);
  });

  it('names the planning store when the configuration only points to it', () => {
    const manifest = manifestOf({
      folders: ['openspec'],
      files: { 'openspec/config.yaml': 'schema: spec-driven\nstore: team-plans\n' },
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([
      { kind: 'changeBased', folder: 'openspec', planningStore: 'team-plans' },
    ]);
  });

  it('ignores the store pointer when the project has its own specs', () => {
    const manifest = manifestOf({
      folders: ['openspec', 'openspec/specs'],
      files: { 'openspec/config.yaml': 'store: team-plans' },
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([{ kind: 'changeBased', folder: 'openspec' }]);
  });

  it('lists numbered features in number order, then timestamped features in time order', () => {
    const manifest = manifestOf({
      folders: ['.specify', 'specs', 'specs/drafts'],
      files: {
        'specs/20261101-093000-sharing/spec.md': null,
        'specs/010-export/spec.md': null,
        'specs/001-photo-albums/spec.md': null,
        'specs/20261020-120000-search/spec.md': null,
      },
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([
      {
        kind: 'featureNumbered',
        folder: '.specify',
        features: [
          { name: '001-photo-albums', folder: 'specs/001-photo-albums', number: 1 },
          { name: '010-export', folder: 'specs/010-export', number: 10 },
          {
            name: '20261020-120000-search',
            folder: 'specs/20261020-120000-search',
            timestamp: '20261020-120000',
          },
          {
            name: '20261101-093000-sharing',
            folder: 'specs/20261101-093000-sharing',
            timestamp: '20261101-093000',
          },
        ],
      },
    ]);
  });

  it('does not list a folder without a feature prefix as a feature', () => {
    const manifest = manifestOf({
      folders: ['.specify', 'specs/drafts', 'specs/01-short', 'specs/abc-001'],
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([
      { kind: 'featureNumbered', folder: '.specify', features: [] },
    ]);
  });

  it('does not treat a specs folder without the marker folder as feature-numbered', () => {
    expect(detectSpecProjects(manifestOf({ files: { 'specs/001-albums/spec.md': null } }))).toEqual([]);
  });

  it('lists each requirements, design and tasks spec folder even with documents missing', () => {
    const manifest = manifestOf({
      files: { '.kiro/specs/checkout/requirements.md': null, '.kiro/specs/checkout/tasks.md': null },
      folders: ['.kiro/specs/login'],
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([
      {
        kind: 'requirementsDesignTasks',
        folder: '.kiro/specs',
        specs: [
          { name: 'checkout', folder: '.kiro/specs/checkout' },
          { name: 'login', folder: '.kiro/specs/login' },
        ],
      },
    ]);
  });

  it('lists numbered decision records in each decision folder', () => {
    const manifest = manifestOf({
      files: {
        'docs/decisions/0003-use-sqlite.md': null,
        'docs/decisions/template.md': null,
        'adr/12-drop-ie.markdown': null,
        'adr/archive/0001-old.md': null,
      },
    });

    expect(detectSpecProjects(manifest)[0]?.layouts).toEqual([
      {
        kind: 'decisionRecords',
        records: [
          { number: '0003', path: 'docs/decisions/0003-use-sqlite.md' },
          { number: '12', path: 'adr/12-drop-ie.markdown' },
        ],
      },
    ]);
  });

  it('detects several layouts in one project', () => {
    const manifest = manifestOf({
      folders: ['openspec/changes', '.specify'],
      files: { 'adr/0001-use-tauri.md': null },
    });

    expect(detectSpecProjects(manifest)[0]?.layouts.map((layout) => layout.kind)).toEqual([
      'changeBased',
      'featureNumbered',
      'decisionRecords',
    ]);
  });

  it('detects projects in direct subfolders of the root', () => {
    const manifest = manifestOf({
      folders: ['apps/web/openspec/specs', 'api/openspec', 'api/openspec/changes'],
      files: { 'api/openspec/changes/add-auth/proposal.md': null, 'tools/GEMINI.md': null },
    });

    expect(detectSpecProjects(manifest)).toEqual([
      { folder: 'api', name: 'api', layouts: [{ kind: 'changeBased', folder: 'openspec' }] },
    ]);
  });

  it('reads a root spec folder as the root project, not as a subfolder project', () => {
    const manifest = manifestOf({ files: { 'docs/adr/0001-use-tauri.md': null } });

    expect(detectSpecProjects(manifest).map((project) => project.folder)).toEqual(['']);
  });
});
