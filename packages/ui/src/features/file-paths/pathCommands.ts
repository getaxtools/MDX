import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';

/** Commands about where a document or folder lives on disk. */
export type PathCommand =
  | { readonly kind: 'copyPath'; readonly path: string }
  | { readonly kind: 'revealInFileManager'; readonly path: string };

export type PathMenuItemId = PathCommand['kind'];

const PATH_MENU_ITEM_IDS: readonly PathMenuItemId[] = ['copyPath', 'revealInFileManager'];

/** Copy Path and Reveal in File Explorer, for the right-click menu of anything with a file or folder. */
export function pathMenuItems(
  translator: Translator,
  { isAvailable = true }: { readonly isAvailable?: boolean } = {},
): ContextMenuItem<PathMenuItemId>[] {
  return [
    { id: 'copyPath', label: translator.translate('paths.copyPath'), hasSeparatorBefore: true },
    {
      id: 'revealInFileManager',
      label: translator.translate('paths.revealInFileManager'),
      isDisabled: !isAvailable,
    },
  ];
}

export function isPathMenuItem(itemId: string): itemId is PathMenuItemId {
  return (PATH_MENU_ITEM_IDS as readonly string[]).includes(itemId);
}

export function commandForPathMenuItem(itemId: PathMenuItemId, path: string): PathCommand {
  return { kind: itemId, path };
}
