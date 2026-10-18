import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';

export type FavouriteMenuItemId = 'open' | 'rename' | 'moveUp' | 'moveDown' | 'remove';

export interface FavouritePosition {
  readonly index: number;
  readonly count: number;
}

export function favouriteContextMenuItems(
  { index, count }: FavouritePosition,
  translator: Translator,
): ContextMenuItem<FavouriteMenuItemId>[] {
  return [
    { id: 'open', label: translator.translate('sidebar.open') },
    { id: 'rename', label: translator.translate('favourites.rename') },
    {
      id: 'moveUp',
      label: translator.translate('favourites.moveUp'),
      isDisabled: index === 0,
      hasSeparatorBefore: true,
    },
    { id: 'moveDown', label: translator.translate('favourites.moveDown'), isDisabled: index === count - 1 },
    { id: 'remove', label: translator.translate('favourites.remove'), hasSeparatorBefore: true },
  ];
}
