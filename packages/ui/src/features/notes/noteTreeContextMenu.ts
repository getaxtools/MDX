import type { NoteTreeNode } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { pathMenuItems, type PathMenuItemId } from '../file-paths/pathCommands';
import { describeCombination } from '../shortcuts/describeCombination';

export type NoteTreeMenuItemId =
  | 'newNote'
  | 'rename'
  | 'cut'
  | 'pasteHere'
  | 'pasteAsChild'
  | 'export'
  | 'exportAsHtml'
  | 'print'
  | 'delete'
  | PathMenuItemId;

type MenuItems = ContextMenuItem<NoteTreeMenuItemId>[];

/** New Note in a folder or under a note, Rename and Cut for notes, and Paste once a note is cut. */
export function noteTreeMenuItems(
  node: NoteTreeNode,
  { hasCutNote }: { readonly hasCutNote: boolean },
  translator: Translator,
): MenuItems {
  const isNote = node.note !== undefined;
  return [
    {
      id: 'newNote',
      label: translator.translate(isNote ? 'notes.tree.newChildNote' : 'notes.tree.newNote'),
    },
    ...(isNote ? noteItems(translator) : []),
    ...pasteItems({ isNote, hasCutNote }, translator),
    ...exportItems(isNote, translator),
    ...pathMenuItems(translator),
    ...(isNote ? [deleteItem(translator)] : []),
  ];
}

/** Export as Markdown for notes and folders; a note also goes out as HTML or on paper through the app's own export and print. */
function exportItems(isNote: boolean, translator: Translator): MenuItems {
  const exportItem: ContextMenuItem<NoteTreeMenuItemId> = {
    id: 'export',
    label: translator.translate('notes.tree.export'),
    hasSeparatorBefore: true,
  };
  if (!isNote) return [exportItem];
  return [
    exportItem,
    { id: 'exportAsHtml', label: translator.translate('notes.tree.exportAsHtml') },
    { id: 'print', label: translator.translate('notes.tree.print') },
  ];
}

function deleteItem(translator: Translator): ContextMenuItem<NoteTreeMenuItemId> {
  return {
    id: 'delete',
    label: translator.translate('notes.tree.delete'),
    hasSeparatorBefore: true,
    shortcut: describeCombination(['Delete'], translator),
  };
}

function noteItems(translator: Translator): MenuItems {
  return [
    {
      id: 'rename',
      label: translator.translate('notes.tree.rename'),
      shortcut: describeCombination(['F2'], translator),
    },
    {
      id: 'cut',
      label: translator.translate('notes.tree.cut'),
      shortcut: describeCombination(['ctrl', 'X'], translator),
    },
  ];
}

function pasteItems(
  { isNote, hasCutNote }: { readonly isNote: boolean; readonly hasCutNote: boolean },
  translator: Translator,
): MenuItems {
  const pasteHere: ContextMenuItem<NoteTreeMenuItemId> = {
    id: 'pasteHere',
    label: translator.translate('notes.tree.pasteHere'),
    isDisabled: !hasCutNote,
    hasSeparatorBefore: true,
    shortcut: describeCombination(['ctrl', 'V'], translator),
  };
  if (!isNote) return [pasteHere];
  return [
    pasteHere,
    { id: 'pasteAsChild', label: translator.translate('notes.tree.pasteAsChild'), isDisabled: !hasCutNote },
  ];
}
