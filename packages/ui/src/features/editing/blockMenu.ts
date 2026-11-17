import { TURN_INTO_KINDS, type BlockAction, type CalloutFoldSign } from '@mdx/editor';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';

/** What the editor's Shift+F10 menu can do: act on the block at the caret, or open the link there. */
export type EditorMenuChoice = BlockAction | 'openLink';

/** For a callout, how it is written to start; the menu offers the other ways. */
function calloutStartItems(
  translator: Translator,
  calloutFold: CalloutFoldSign | undefined,
): ContextMenuItem<BlockAction>[] {
  if (calloutFold === undefined) return [];
  const items: ContextMenuItem<BlockAction>[] = [];
  if (calloutFold !== '-')
    items.push({ id: 'startCollapsed', label: translator.translate('editor.blockMenu.startCollapsed') });
  if (calloutFold !== '+')
    items.push({ id: 'startExpanded', label: translator.translate('editor.blockMenu.startExpanded') });
  return items.map((item, index) => ({ ...item, hasSeparatorBefore: index === 0 }));
}

/** The block at the caret as the menu needs it. */
export interface MenuBlock {
  /** For a callout, how it is written to start. */
  readonly calloutFold?: CalloutFoldSign | undefined;
  /** A table shown as a grid in Rich text, which can be edited as text instead. */
  readonly isGridTable?: boolean;
}

/**
 * The block menu: edit a grid table as text, move, duplicate and delete the block at the caret,
 * choose how a callout starts, or turn the block into another kind.
 */
export function blockMenuItems(
  translator: Translator,
  { calloutFold, isGridTable = false }: MenuBlock = {},
): ContextMenuItem<BlockAction>[] {
  const tableItems: ContextMenuItem<BlockAction>[] = isGridTable
    ? [{ id: 'editTableAsText', label: translator.translate('editor.blockMenu.editTableAsText') }]
    : [];
  return [
    ...tableItems,
    { id: 'moveUp', label: translator.translate('editor.action.moveBlockUp'), shortcut: 'Alt+Shift+↑' },
    { id: 'moveDown', label: translator.translate('editor.action.moveBlockDown'), shortcut: 'Alt+Shift+↓' },
    { id: 'duplicate', label: translator.translate('editor.blockMenu.duplicate') },
    { id: 'delete', label: translator.translate('editor.blockMenu.delete') },
    ...calloutStartItems(translator, calloutFold),
    ...TURN_INTO_KINDS.map((kind, index) => ({
      id: `turnInto.${kind}` as const,
      label: translator.translate(`editor.blockMenu.turnInto.${kind}`),
      hasSeparatorBefore: index === 0,
    })),
  ];
}

/** The block menu, led by Open Link while the caret is in a link. */
export function editorMenuItems(
  translator: Translator,
  { isCaretInLink, ...block }: { readonly isCaretInLink: boolean } & MenuBlock,
): ContextMenuItem<EditorMenuChoice>[] {
  const blockItems = blockMenuItems(translator, block);
  if (!isCaretInLink) return blockItems;
  const [firstBlockItem, ...otherBlockItems] = blockItems;
  return [
    { id: 'openLink', label: translator.translate('editor.action.openLink') },
    ...(firstBlockItem ? [{ ...firstBlockItem, hasSeparatorBefore: true }] : []),
    ...otherBlockItems,
  ];
}

/** The looks a callout's type menu offers, named as the preview names them. */
export const CALLOUT_TYPE_CHOICES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type CalloutTypeChoice = (typeof CALLOUT_TYPE_CHOICES)[number];

export function calloutTypeMenuItems(translator: Translator): ContextMenuItem<CalloutTypeChoice>[] {
  return CALLOUT_TYPE_CHOICES.map((type) => ({
    id: type,
    label: translator.translate(`document.alert.${type}`),
  }));
}
