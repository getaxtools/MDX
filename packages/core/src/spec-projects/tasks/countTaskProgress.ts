export interface TaskItem {
  /** Counted from 1, as editors show it. */
  readonly lineNumber: number;
  readonly isDone: boolean;
  /** The text after the checkbox. */
  readonly description: string;
}

export interface TaskProgress {
  readonly done: number;
  readonly total: number;
}

// A list item under any marker and indent, then a checkbox of at most one character; `- [A](url)` is a link.
const TASK_LINE = /^\s*(?:[-*+]|\d{1,9}[.)])\s+\[([^\]]*)\](?=\s|$)(.*)$/;
const LINE_BREAK = /\r\n|\r|\n/;

function taskOf(line: string, lineNumber: number): TaskItem | undefined {
  const match = TASK_LINE.exec(line);
  if (!match) return undefined;
  const marker = (match[1] ?? '').trim();
  if (marker.length > 1) return undefined;
  return { lineNumber, isDone: marker === 'x' || marker === 'X', description: (match[2] ?? '').trim() };
}

/** The checkbox list items of a tasks document, in order. */
export function readTasks(text: string): TaskItem[] {
  return text.split(LINE_BREAK).flatMap((line, index) => taskOf(line, index + 1) ?? []);
}

/** Every checkbox counts as a task; only `x` or `X` counts as done, so `[~]` and `[-]` stay open. */
export function countTaskProgress(text: string): TaskProgress {
  const tasks = readTasks(text);
  return { done: tasks.filter((task) => task.isDone).length, total: tasks.length };
}
