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

// A list item under any marker and indent, then a checkbox holding at most one character. A box with a
// mark may not be followed by `(` or `[`, so link bullets such as `- [A](url)` are not tasks.
const LIST_ITEM_START = /^\s*(?:[-*+]|\d{1,9}[.)])\s*\[/;
const MARKED_BOX_END = /^\s*([^\]\s]?)\s*\](?![([])/;
const BLANK_BOX_END = /^\s+\]/;

function taskOf(line: string, lineNumber: number): TaskItem | undefined {
  const start = LIST_ITEM_START.exec(line);
  if (!start) return undefined;
  const afterBracket = line.slice(start[0].length);
  const box = MARKED_BOX_END.exec(afterBracket) ?? BLANK_BOX_END.exec(afterBracket);
  if (!box) return undefined;
  const marker = box[1] ?? '';
  const description = afterBracket.slice(box[0].length).trim();
  return { lineNumber, isDone: marker.toLowerCase() === 'x', description };
}

/** The checkbox list items of a tasks document, in order; lines end at `\n` only, as the tasks tool reads them. */
export function readTasks(text: string): TaskItem[] {
  return text.split('\n').flatMap((line, index) => taskOf(line, index + 1) ?? []);
}

/** Every checkbox counts as a task; only `x` or `X` counts as done, so `[~]` and `[-]` stay open. */
export function countTaskProgress(text: string): TaskProgress {
  const tasks = readTasks(text);
  return { done: tasks.filter((task) => task.isDone).length, total: tasks.length };
}
