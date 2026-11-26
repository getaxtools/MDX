import { readTasks } from '../tasks/countTaskProgress';
import { findingOf, type StructuralFinding } from './structuralFindings';

export interface TaskDocument {
  readonly path: string;
  readonly text: string;
}

const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])\s+\S/;
const CODE_BLOCK_COLUMN = 4;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)/;
const FRONT_MATTER_DELIMITER = /^-{3}\s*$/;
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const LEVEL_TWO_HEADING = /^ {0,3}##(?!#)(?:[ \t]+|[ \t]*\r?$)/;
const NUMBERED_GROUP_HEADING = /^ {0,3}##[ \t]+(\d+)\.(?:[ \t]|\r?$)/;
const TASK_NUMBER = /^(\d+(?:\.\d+)+(?:[A-Za-z]+)?)(?=\s|$)/;

function indentColumns(line: string): number {
  let column = 0;
  for (const character of line) {
    if (character === ' ') column += 1;
    else if (character === '\t') column += CODE_BLOCK_COLUMN - (column % CODE_BLOCK_COLUMN);
    else break;
  }
  return column;
}

function firstLineAfterFrontMatter(lines: readonly string[]): number {
  const first = (lines[0] ?? '').replace(/^\uFEFF/, '').trimEnd();
  if (!FRONT_MATTER_DELIMITER.test(first)) return 0;
  const closing = lines.findIndex((line, index) => index > 0 && FRONT_MATTER_DELIMITER.test(line.trimEnd()));
  return closing === -1 ? 0 : closing + 1;
}

interface RenderedScan {
  openFence?: { readonly marker: string; readonly length: number } | undefined;
  isInComment: boolean;
}

/** Opens a fence, or closes the open one with a run of its marker at least as long and nothing after it. */
function followFence(fence: RegExpExecArray, scan: RenderedScan): void {
  const run = fence[1] ?? '';
  const marker = run.charAt(0);
  const openFence = scan.openFence;
  if (openFence === undefined) {
    scan.openFence = { marker, length: run.length };
    return;
  }
  const isCloser =
    marker === openFence.marker && run.length >= openFence.length && (fence[2] ?? '').trim() === '';
  if (isCloser) scan.openFence = undefined;
}

/** Whether a line is hidden from the rendered document: a fence line, inside a fence or inside a comment. */
function isHiddenLine(line: string, scan: RenderedScan): boolean {
  if (scan.isInComment) {
    if (line.includes(COMMENT_CLOSE)) scan.isInComment = false;
    return true;
  }
  const fence = FENCE.exec(line);
  if (fence) {
    followFence(fence, scan);
    return true;
  }
  if (scan.openFence !== undefined) return true;
  if (!line.trimStart().startsWith(COMMENT_OPEN)) return false;
  scan.isInComment = !line.includes(COMMENT_CLOSE, line.indexOf(COMMENT_OPEN) + COMMENT_OPEN.length);
  return true;
}

/** The first rendered list item, counted from 1, skipping front matter, fences, comments and indented code. */
function firstListItemLine(text: string): number | undefined {
  const lines = text.split('\n');
  const scan: RenderedScan = { isInComment: false };
  for (let index = firstLineAfterFrontMatter(lines); index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isHiddenLine(line, scan)) continue;
    if (LIST_ITEM.test(line) && indentColumns(line) < CODE_BLOCK_COLUMN) return index + 1;
  }
  return undefined;
}

/** Tasks written as plain list items: reported only when no tracked task document holds a checkbox. */
function missingCheckboxFindings(documents: readonly TaskDocument[]): StructuralFinding[] {
  if (documents.some((document) => readTasks(document.text).length > 0)) return [];
  return documents.flatMap((document) => {
    const line = firstListItemLine(document.text);
    return line === undefined ? [] : [findingOf('tasksWithoutCheckboxes', { path: document.path, line })];
  });
}

function withoutLeadingZeros(number: string): string {
  return number.replace(/^0+(?=\d)/, '');
}

interface FirstDeclaration {
  readonly path: string;
  readonly line: number;
}

function numberingFindingsIn(
  document: TaskDocument,
  firstDeclarations: Map<string, FirstDeclaration>,
): StructuralFinding[] {
  const lines = document.text.split('\n');
  if (!lines.some((line) => NUMBERED_GROUP_HEADING.test(line))) return [];
  const findings: StructuralFinding[] = [];
  let group: string | undefined;
  for (const [index, line] of lines.entries()) {
    if (LEVEL_TWO_HEADING.test(line)) group = NUMBERED_GROUP_HEADING.exec(line)?.[1];
    const number = TASK_NUMBER.exec(readTasks(line)[0]?.description ?? '')?.[1];
    if (group === undefined || number === undefined) continue;
    const task: NumberedTask = { path: document.path, line: index + 1, number, group };
    findings.push(...numberedTaskFindings(task, firstDeclarations));
  }
  return findings;
}

interface NumberedTask {
  readonly path: string;
  readonly line: number;
  readonly number: string;
  /** The number of the `## N.` group the task sits under. */
  readonly group: string;
}

function numberedTaskFindings(
  task: NumberedTask,
  firstDeclarations: Map<string, FirstDeclaration>,
): StructuralFinding[] {
  const place = { path: task.path, line: task.line, subject: task.number };
  const findings: StructuralFinding[] = [];
  const taskGroup = task.number.split('.')[0] ?? '';
  if (withoutLeadingZeros(taskGroup) !== withoutLeadingZeros(task.group)) {
    findings.push(findingOf('taskOutsideItsGroup', { ...place, detail: task.group }));
  }
  const first = firstDeclarations.get(task.number);
  if (first) findings.push(findingOf('duplicateTaskNumber', { ...place, detail: String(first.line) }));
  else firstDeclarations.set(task.number, { path: task.path, line: task.line });
  return findings;
}

export interface TaskCheckOptions {
  /** Numbering is checked only for the tool's built-in schema, whose template numbers tasks. */
  readonly isNumberingChecked: boolean;
}

/** The structural findings of a change's tracked task documents. */
export function checkTaskDocuments(
  documents: readonly TaskDocument[],
  options: TaskCheckOptions,
): StructuralFinding[] {
  const firstDeclarations = new Map<string, FirstDeclaration>();
  const numbering = options.isNumberingChecked
    ? documents.flatMap((document) => numberingFindingsIn(document, firstDeclarations))
    : [];
  return [...missingCheckboxFindings(documents), ...numbering];
}
