import { TURN_INTO_KINDS, type BlockAction } from '@mdx/editor';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';

/** The block menu: move, duplicate and delete the block at the caret, or turn it into another kind. */
export function blockMenuItems(translator: Translator): ContextMenuItem<BlockAction>[] {
  return [
    { id: 'moveUp', label: translator.translate('editor.action.moveBlockUp'), shortcut: 'Alt+Shift+↑' },
    { id: 'moveDown', label: translator.translate('editor.action.moveBlockDown'), shortcut: 'Alt+Shift+↓' },
    { id: 'duplicate', label: translator.translate('editor.blockMenu.duplicate') },
    { id: 'delete', label: translator.translate('editor.blockMenu.delete') },
    ...TURN_INTO_KINDS.map((kind, index) => ({
      id: `turnInto.${kind}` as const,
      label: translator.translate(`editor.blockMenu.turnInto.${kind}`),
      hasSeparatorBefore: index === 0,
    })),
  ];
}
