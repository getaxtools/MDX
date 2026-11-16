import { InMemorySpecProjects } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { SpecViewerActions } from './SpecViewerActions';

const ROOT = 'C:\\Projects\\shop';

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
    expect(specProjects.readFiles).toEqual([`${ROOT}|openspec/changes/add-pins/tasks.md`]);
    expect(onChange).toHaveBeenCalledTimes(2);
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
});
