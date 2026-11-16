import { formatFileSize } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import type { NotesMoveProblem, NotesMoveProblemCode } from '@mdx/platform';

/** A message for the notice bar or a dialog, with the values it names. */
export interface MoveNotice {
  readonly key: MessageKey;
  readonly values?: Readonly<Record<string, string | number>>;
}

const PROBLEM_KEYS: Readonly<Record<NotesMoveProblemCode, MessageKey>> = {
  targetNotEmpty: 'notesLocation.move.problem.targetNotEmpty',
  targetInsideLocation: 'notesLocation.move.problem.targetInsideLocation',
  targetContainsLocation: 'notesLocation.move.problem.targetContainsLocation',
  targetRefused: 'notesLocation.move.problem.targetRefused',
  notEnoughSpace: 'notesLocation.move.problem.notEnoughSpace',
  linksInside: 'notesLocation.move.problem.linksInside',
  pathsTooLong: 'notesLocation.move.problem.pathsTooLong',
  sourceUnreadable: 'notesLocation.move.problem.sourceUnreadable',
  targetUnwritable: 'notesLocation.move.problem.targetUnwritable',
  diskFull: 'notesLocation.move.problem.diskFull',
  fileLocked: 'notesLocation.move.problem.fileLocked',
  hashMismatch: 'notesLocation.move.problem.hashMismatch',
  countMismatch: 'notesLocation.move.problem.countMismatch',
  targetChanged: 'notesLocation.move.problem.targetChanged',
  keepsChanging: 'notesLocation.move.problem.keepsChanging',
  stopped: 'notesLocation.move.problem.stopped',
  wrongState: 'notesLocation.move.problem.wrongState',
  moveUnderway: 'notesLocation.move.problem.moveUnderway',
  noMove: 'notesLocation.move.problem.noMove',
  oldCopyInUse: 'notesLocation.move.problem.oldCopyInUse',
  accessDenied: 'notesLocation.move.problem.accessDenied',
  invalidRequest: 'notesLocation.move.problem.invalidRequest',
  journalUnavailable: 'notesLocation.move.problem.journalUnavailable',
};

/** What went wrong, naming the file or the sizes, for a problem the move reported. */
export function moveProblemNotice(problem: NotesMoveProblem, locale: string): MoveNotice {
  return { key: PROBLEM_KEYS[problem.code], values: problemValues(problem, locale) };
}

function problemValues(problem: NotesMoveProblem, locale: string): Readonly<Record<string, string | number>> {
  if (problem.code === 'notEnoughSpace') {
    return {
      required: formatFileSize(problem.requiredBytes, locale),
      available: formatFileSize(problem.availableBytes, locale),
    };
  }
  if (problem.code === 'linksInside' || problem.code === 'pathsTooLong') {
    return { count: problem.count, paths: problem.paths.join(', ') };
  }
  if (problem.code === 'countMismatch') return { expected: problem.expected, found: problem.found };
  return 'path' in problem ? { path: problem.path } : {};
}
