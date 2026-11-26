import { formatFileSize } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import type { NotesMoveCommand, NotesMoveDialog, NotesMoveStatus } from './NotesMoveActions';

interface DialogButton {
  readonly label: string;
  readonly command: NotesMoveCommand;
}

/** What a move's dialog says, and the command behind each of its buttons. */
export interface NotesMoveDialogText {
  readonly title: string;
  readonly message: string;
  readonly confirm: DialogButton;
  /** The focused button, chosen by Enter and Escape: the choice that changes nothing. */
  readonly cancel: DialogButton;
  readonly alternative?: DialogButton;
}

export function notesMoveStatusText(status: NotesMoveStatus, translator: Translator): string {
  if (status.kind === 'planned' || status.kind === 'paused') {
    return translator.translate(`notesLocation.move.status.${status.kind}`);
  }
  return translator.translate(`notesLocation.move.status.${status.kind}`, {
    done: status.doneFiles,
    total: status.totalFiles,
  });
}

export function notesMoveDialogText(dialog: NotesMoveDialog, translator: Translator): NotesMoveDialogText {
  if (dialog.kind === 'plan') return planText(dialog, translator);
  if (dialog.kind === 'resume') return resumeText(dialog, translator);
  if (dialog.kind === 'removalOffer') return removalOfferText(dialog, translator);
  if (dialog.kind === 'closeDuringMove') return closeDuringMoveText(dialog, translator);
  return removalConfirmationText(dialog, translator);
}

function closeDuringMoveText(
  { source }: Extract<NotesMoveDialog, { kind: 'closeDuringMove' }>,
  translator: Translator,
): NotesMoveDialogText {
  return {
    title: translator.translate('notesLocation.move.closeTitle'),
    message: translator.translate('notesLocation.move.closeMessage', { source }),
    confirm: buttonOf(translator, 'notesLocation.move.stopAndClose', { kind: 'stopNotesMoveAndClose' }),
    cancel: buttonOf(translator, 'notesLocation.move.keepMoving', { kind: 'keepMovingNotes' }),
  };
}

function buttonOf(translator: Translator, key: MessageKey, command: NotesMoveCommand): DialogButton {
  return { label: translator.translate(key), command };
}

function planText(
  { target, plan }: Extract<NotesMoveDialog, { kind: 'plan' }>,
  translator: Translator,
): NotesMoveDialogText {
  const size = (bytes: number) => formatFileSize(bytes, translator.locale);
  const message = translator.translate('notesLocation.move.planMessage', {
    count: plan.fileCount,
    size: size(plan.totalBytes),
  });
  const onlineOnly =
    plan.onlineOnlyCount > 0
      ? translator.translate('notesLocation.move.onlineOnly', {
          count: plan.onlineOnlyCount,
          size: size(plan.onlineOnlyBytes),
        })
      : '';
  return {
    title: translator.translate('notesLocation.move.planTitle', { target }),
    message: [message, onlineOnly].filter(Boolean).join(' '),
    confirm: buttonOf(translator, 'notesLocation.move.start', { kind: 'startNotesMove' }),
    cancel: buttonOf(translator, 'notesLocation.move.cancel', { kind: 'cancelNotesMove' }),
  };
}

function resumeText(
  { source, target, problem }: Extract<NotesMoveDialog, { kind: 'resume' }>,
  translator: Translator,
): NotesMoveDialogText {
  const reason = problem ? translator.translate(problem.key, problem.values) : '';
  const message = translator.translate('notesLocation.move.resumeMessage', { source, target });
  return {
    title: translator.translate('notesLocation.move.resumeTitle'),
    message: [reason, message].filter(Boolean).join(' '),
    confirm: buttonOf(translator, 'notesLocation.move.resume', { kind: 'resumeNotesMove' }),
    alternative: buttonOf(translator, 'notesLocation.move.cancelMove', { kind: 'cancelNotesMove' }),
    cancel: buttonOf(translator, 'notesLocation.move.later', { kind: 'postponeNotesMove' }),
  };
}

function removalOfferText(
  { target, oldCopy }: Extract<NotesMoveDialog, { kind: 'removalOffer' }>,
  translator: Translator,
): NotesMoveDialogText {
  return {
    title: translator.translate('notesLocation.move.removalTitle', { target }),
    message: translator.translate('notesLocation.move.removalMessage', {
      path: oldCopy.path,
      count: oldCopy.fileCount,
      size: formatFileSize(oldCopy.totalBytes, translator.locale),
    }),
    confirm: buttonOf(translator, 'notesLocation.move.removeOldCopy', { kind: 'askToRemoveOldNotesCopy' }),
    cancel: buttonOf(translator, 'notesLocation.move.keepOldCopy', { kind: 'keepOldNotesCopy' }),
  };
}

function removalConfirmationText(
  { oldCopy }: Extract<NotesMoveDialog, { kind: 'removalConfirmation' }>,
  translator: Translator,
): NotesMoveDialogText {
  return {
    title: translator.translate('notesLocation.move.removalConfirmTitle', { count: oldCopy.fileCount }),
    message: translator.translate('notesLocation.move.removalConfirmMessage', { path: oldCopy.path }),
    confirm: buttonOf(translator, 'notesLocation.move.moveToRecycleBin', { kind: 'removeOldNotesCopy' }),
    cancel: buttonOf(translator, 'notesLocation.move.keepOldCopy', { kind: 'keepOldNotesCopy' }),
  };
}
