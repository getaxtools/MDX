import type { FileArcEntry } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';

/** Markdown viewer workspaces move between files, Notes workspaces between notes. */
export type FileArcWording = 'files' | 'notes';

const WORDING_KEYS: Readonly<
  Record<
    FileArcWording,
    { readonly label: MessageKey; readonly kept: MessageKey; readonly empty: MessageKey }
  >
> = {
  files: { label: 'fileArc.label', kept: 'fileArc.kept', empty: 'fileArc.empty' },
  notes: { label: 'fileArc.notes.label', kept: 'fileArc.notes.kept', empty: 'fileArc.notes.empty' },
};

export function fileArcLabel(wording: FileArcWording, translator: Translator): string {
  return translator.translate(WORDING_KEYS[wording].label);
}

/** What Esc announces: nothing opened. */
export function keptCurrentText(wording: FileArcWording, translator: Translator): string {
  return translator.translate(WORDING_KEYS[wording].kept);
}

/** Why the arc did not open: nothing else is listed. */
export function emptyListText(wording: FileArcWording, translator: Translator): string {
  return translator.translate(WORDING_KEYS[wording].empty);
}

/** `3 of 12` */
export function positionText(index: number, count: number, translator: Translator): string {
  return translator.translate('fileArc.position', { position: index + 1, count });
}

/** `install.md, 3 of 12`, with `, open in a tab` for an entry that is: what a screen reader hears. */
export function entryAccessibleName(
  entry: FileArcEntry,
  { index, count }: { readonly index: number; readonly count: number },
  translator: Translator,
): string {
  const named = translator.translate('fileArc.entryName', {
    name: entry.name,
    position: positionText(index, count, translator),
  });
  return entry.isOpenInTab ? translator.translate('fileArc.entryOpenInTab', { entry: named }) : named;
}

/** `Handbook › docs · edited yesterday`; either part may be missing. */
export function cardDetailsText(
  entry: FileArcEntry,
  lastEdited: string | undefined,
  translator: Translator,
): string {
  const edited =
    lastEdited === undefined ? undefined : translator.translate('fileArc.edited', { when: lastEdited });
  return [entry.folderLabel, edited].filter((part) => part !== undefined && part !== '').join(' · ');
}
