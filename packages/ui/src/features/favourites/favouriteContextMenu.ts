import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { describeCombination } from '../shortcuts/describeCombination';

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
    {
      id: 'rename',
      label: translator.translate('favourites.rename'),
      shortcut: describeCombination(['F2'], translator),
    },
    {
      id: 'moveUp',
      label: translator.translate('favourites.moveUp'),
      isDisabled: index === 0,
      hasSeparatorBefore: true,
      shortcut: describeCombination(['alt', '↑'], translator),
    },
    {
      id: 'moveDown',
      label: translator.translate('favourites.moveDown'),
      isDisabled: index === count - 1,
      shortcut: describeCombination(['alt', '↓'], translator),
    },
    { id: 'remove', label: translator.translate('favourites.remove'), hasSeparatorBefore: true },
  ];
}
