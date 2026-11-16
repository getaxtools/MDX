import { describe, expect, it } from 'vitest';
import { readFeatureTasks } from './readFeatureTasks';

const TASKS = [
  '# Tasks',
  '',
  '- [x] T000 Set up the folder',
  '',
  '## Phase 1: Setup',
  '',
  '- [X] T010 [P] [US1] Add the album model',
  '- [ ] T011 [US1] Add the album list',
  '- [x] T012 [US2] [P] Share an album',
  '',
  '## Notes',
  '',
  '- [ ] T099 Not in a phase',
  '',
  '## Phase 2: Polish',
  '',
  '- [ ] T020 Tidy up',
].join('\n');

describe('readFeatureTasks', () => {
  it('reads the ID, the parallel marker and the user story of each task', () => {
    const { tasks } = readFeatureTasks(TASKS);

    expect(tasks[1]).toEqual({
      lineNumber: 7,
      isDone: true,
      id: 'T010',
      isParallel: true,
      story: 'US1',
      phase: 'Phase 1: Setup',
      description: 'Add the album model',
    });
    expect(tasks[3]).toMatchObject({
      id: 'T012',
      isParallel: true,
      story: 'US2',
      description: 'Share an album',
    });
  });

  it('counts progress per user story, with lowercase and uppercase x as done', () => {
    const { stories } = readFeatureTasks(TASKS);

    expect(stories).toEqual([
      { name: 'US1', done: 1, total: 2 },
      { name: 'US2', done: 1, total: 1 },
    ]);
  });

  it('counts progress per phase and leaves tasks outside any phase out of the phases', () => {
    const { tasks, phases } = readFeatureTasks(TASKS);

    expect(phases).toEqual([
      { name: 'Phase 1: Setup', done: 2, total: 3 },
      { name: 'Phase 2: Polish', done: 0, total: 1 },
    ]);
    expect(tasks.filter((task) => task.phase === undefined).map((task) => task.id)).toEqual(['T000', 'T099']);
  });
});
