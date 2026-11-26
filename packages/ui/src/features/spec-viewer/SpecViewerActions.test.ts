import { InMemorySpecProjects, type SpecProjectManifest } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { ProjectTextCache } from './ProjectTextCache';
import { SpecViewerActions } from './SpecViewerActions';

const ROOT = 'C:\\Projects\\shop';

/** Holds back scans while gated, as a slow share does, until the gates open. */
class GatedSpecProjects extends InMemorySpecProjects {
  isGated = false;
  private readonly gates: (() => void)[] = [];

  override scanProject(root: string): Promise<SpecProjectManifest> {
    const scan = super.scanProject(root);
    if (!this.isGated) return scan;
    return new Promise((resolve) => this.gates.push(() => resolve(scan)));
  }

  openGates(): void {
    for (const open of this.gates.splice(0)) open();
  }
}

function actionsWith(specProjects: InMemorySpecProjects) {
  const onChange = vi.fn();
  return { actions: new SpecViewerActions({ specProjects, onChange }), onChange };
}

describe('SpecViewerActions', () => {
  it('scans each folder and reads the tasks of active changes for their progress', async () => {
    const specProjects = new InMemorySpecProjects({
      [ROOT]: {
        files: {
          'openspec/specs/tabs/spec.md': '# tabs',
          'openspec/changes/add-pins/proposal.md': '# Proposal',
          'openspec/changes/add-pins/tasks.md': '- [x] 1.1\n- [ ] 1.2',
          'openspec/changes/archive/2026-10-01-add-tabs/tasks.md': '- [x] 1.1',
        },
      },
    });
    const { actions, onChange } = actionsWith(specProjects);

    await actions.show([ROOT]);

    const project = actions.view()?.roots?.[0]?.projects[0];
    expect(project?.activeChanges.map((change) => [change.name, change.progress])).toEqual([
      ['add-pins', { done: 1, total: 2 }],
    ]);
    expect(specProjects.readFiles.filter((read) => read.endsWith('tasks.md'))).toEqual([
      `${ROOT}|openspec/changes/add-pins/tasks.md`,
    ]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('checks the structure of each active change against the current specs', async () => {
    const specProjects = new InMemorySpecProjects({
      [ROOT]: {
        files: {
          'openspec/config.yaml': 'schema: spec-driven',
          'openspec/specs/tabs/spec.md':
            '## Purpose\nTabs.\n## Requirements\n### Requirement: Open\nIt SHALL open.\n#### Scenario: A\n- **WHEN** a\n- **THEN** b\n#### Scenario: B\n- **WHEN** a\n- **THEN** b',
          'openspec/changes/add-pins/specs/tabs/spec.md':
            '## MODIFIED Requirements\n### Requirement: Open\nIt SHALL open.\n#### Scenario: A\n- **WHEN** a\n- **THEN** b',
        },
      },
    });
    const { actions } = actionsWith(specProjects);

    await actions.show([ROOT]);

    const findings = actions.view()?.roots?.[0]?.findingsByChange.get('openspec/changes/add-pins');
    expect(findings?.map((finding) => [finding.rule, finding.detail])).toEqual([
      ['modifiedDropsScenario', 'B'],
    ]);
  });

  it('shows the folders as being read until the scan ends', () => {
    const { actions } = actionsWith(new InMemorySpecProjects({ [ROOT]: { files: {} } }));

    void actions.show([ROOT]);

    expect(actions.view()).toEqual({ roots: undefined, unreadableFolders: [] });
  });

  it('lists a folder that cannot be scanned as unreadable', async () => {
    const { actions } = actionsWith(new InMemorySpecProjects());

    await actions.show([ROOT]);

    expect(actions.view()).toEqual({ roots: [], unreadableFolders: [ROOT] });
  });

  it('keeps the newest scan when the folders change during one', async () => {
    const other = 'C:\\Projects\\api';
    const { actions } = actionsWith(
      new InMemorySpecProjects({
        [ROOT]: { files: {} },
        [other]: { files: { 'adr/0001-use-x.md': '# Use X' } },
      }),
    );

    const first = actions.show([ROOT]);
    await actions.show([other]);
    await first;

    expect(actions.view()?.roots?.map((scanned) => scanned.root.displayPath)).toEqual([other]);
  });

  it('forgets the projects when the workspace is hidden', async () => {
    const { actions } = actionsWith(new InMemorySpecProjects({ [ROOT]: { files: {} } }));
    await actions.show([ROOT]);

    actions.hide();

    expect(actions.view()).toBeUndefined();
  });

  it('shows only the newest scan of a folder when an older one finishes last', async () => {
    const specProjects = new GatedSpecProjects({
      [ROOT]: { files: { 'openspec/changes/add-pins/tasks.md': '- [ ] 1.1' } },
    });
    const { actions } = actionsWith(specProjects);
    await actions.show([ROOT]);
    const changeNames = () =>
      actions.view()?.roots?.[0]?.projects[0]?.activeChanges.map((change) => change.name);

    specProjects.isGated = true;
    const olderRefresh = actions.refresh([ROOT]);
    specProjects.isGated = false;
    specProjects.removeFile(ROOT, 'openspec/changes/add-pins/tasks.md');
    specProjects.writeFile(ROOT, 'openspec/changes/add-tabs/tasks.md', '- [ ] 1.1');
    await actions.refresh([ROOT]);
    specProjects.openGates();
    await olderRefresh;

    expect(changeNames()).toEqual(['add-tabs']);
  });

  it('watches the folders at once, then with the links their scans followed, in the order asked', async () => {
    const specProjects = new InMemorySpecProjects({
      [ROOT]: {
        files: { 'openspec/specs/tabs/spec.md': '# tabs' },
        links: [{ path: 'shared', isFollowed: true }],
      },
    });
    const { actions } = actionsWith(specProjects);

    await actions.show([ROOT]);
    actions.hide();
    await vi.waitFor(() => expect(specProjects.watchCalls).toHaveLength(3));

    expect(specProjects.watchCalls).toEqual([
      [{ root: ROOT, followedLinks: [] }],
      [{ root: ROOT, followedLinks: ['shared'] }],
      [],
    ]);
  });
});

describe('ProjectTextCache', () => {
  it('reads a file again after a failed read, though its modified time is the same', async () => {
    const specProjects = new InMemorySpecProjects({ [ROOT]: { files: {} } });
    const cache = new ProjectTextCache(specProjects);
    const manifest = {
      root: { canonicalKey: ROOT.toLowerCase(), displayPath: ROOT, fileName: 'shop' },
      folders: [],
      files: [{ path: 'a.md', sizeBytes: 3, modifiedAtMs: 5, text: null }],
      links: [],
      isIncomplete: false,
    };

    expect(await cache.readerFor(ROOT, manifest)('a.md')).toBeUndefined();
    specProjects.writeFile(ROOT, 'a.md', '# A');

    expect(await cache.readerFor(ROOT, manifest)('a.md')).toBe('# A');
  });
});
