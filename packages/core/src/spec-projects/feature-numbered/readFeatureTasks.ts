import { readTasks } from '../tasks/countTaskProgress';

export interface FeatureTask {
  /** Counted from 1. */
  readonly lineNumber: number;
  readonly isDone: boolean;
  /** Such as `T001`. */
  readonly id?: string | undefined;
  /** Marked `[P]`: it can run in parallel with other tasks. */
  readonly isParallel: boolean;
  /** Such as `US1`. */
  readonly story?: string | undefined;
  /** The `## Phase` heading the task is under. */
  readonly phase?: string | undefined;
  readonly description: string;
}

export interface TaskGroupProgress {
  readonly name: string;
  readonly done: number;
  readonly total: number;
}

export interface FeatureTasks {
  readonly tasks: readonly FeatureTask[];
  /** Progress per phase heading, in document order. */
  readonly phases: readonly TaskGroupProgress[];
  /** Progress per user story label, in the order the labels first appear. */
  readonly stories: readonly TaskGroupProgress[];
}

const LEVEL_TWO_HEADING = /^##\s+(.+?)\s*#*\s*$/;
const PHASE_TITLE = /^Phase\b/i;
const TASK_ID = /^(T\d+)\b\s*/;
const LABEL = /^\[([^\]]+)\]\s*/;
const STORY_LABEL = /^US\d+$/i;
const PARALLEL_LABEL = 'P';

interface ParsedLabels {
  readonly isParallel: boolean;
  readonly story?: string | undefined;
  readonly description: string;
}

/** Reads the `[P]` and `[USn]` labels at the start of a task, in any order. */
function labelsOf(text: string): ParsedLabels {
  let rest = text;
  let isParallel = false;
  let story: string | undefined;
  for (let label = LABEL.exec(rest); label; label = LABEL.exec(rest)) {
    const name = label[1] ?? '';
    if (name.toUpperCase() === PARALLEL_LABEL) isParallel = true;
    else if (STORY_LABEL.test(name)) story = name.toUpperCase();
    else break;
    rest = rest.slice(label[0].length);
  }
  return { isParallel, story, description: rest.trim() };
}

function phasesByLine(lines: readonly string[]): (string | undefined)[] {
  let phase: string | undefined;
  return lines.map((line) => {
    const heading = LEVEL_TWO_HEADING.exec(line)?.[1];
    if (heading !== undefined) phase = PHASE_TITLE.test(heading) ? heading : undefined;
    return phase;
  });
}

function progressBy(tasks: readonly FeatureTask[], groupOf: (task: FeatureTask) => string | undefined) {
  const groups = new Map<string, { done: number; total: number }>();
  for (const task of tasks) {
    const name = groupOf(task);
    if (name === undefined) continue;
    const group = groups.get(name) ?? { done: 0, total: 0 };
    groups.set(name, { done: group.done + (task.isDone ? 1 : 0), total: group.total + 1 });
  }
  return [...groups.entries()].map(([name, progress]) => ({ name, ...progress }));
}

/** The tasks of a feature with their ID, parallel marker, user story and phase; the checkbox rule decides done. */
export function readFeatureTasks(text: string): FeatureTasks {
  const phases = phasesByLine(text.split('\n'));
  const tasks = readTasks(text).map((task): FeatureTask => {
    const id = TASK_ID.exec(task.description);
    const labels = labelsOf(id ? task.description.slice(id[0].length) : task.description);
    return {
      lineNumber: task.lineNumber,
      isDone: task.isDone,
      id: id?.[1],
      ...labels,
      phase: phases[task.lineNumber - 1],
    };
  });
  return {
    tasks,
    phases: progressBy(tasks, (task) => task.phase),
    stories: progressBy(tasks, (task) => task.story),
  };
}
