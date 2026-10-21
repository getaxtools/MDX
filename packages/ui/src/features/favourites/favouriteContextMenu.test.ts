import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { favouriteContextMenuItems, groupIdOfMenuItem } from './favouriteContextMenu';

const translator = createTranslator();
const groups = [
  { id: 'group-1', name: 'Specs' },
  { id: 'group-2', name: 'Notes' },
];

describe('favourite context menu', () => {
  it('offers to move an ungrouped favourite into a new or an existing group', () => {
    const items = favouriteContextMenuItems(
      { canMoveUp: false, canMoveDown: true, groups, groupId: undefined, isFolder: false },
      translator,
    );

    expect(items.map((item) => item.label)).toEqual([
      'Open',
      'Rename…',
      'Move Up',
      'Move Down',
      'Move to New Group',
      'Move to Specs',
      'Move to Notes',
      'Copy Path',
      'Reveal in File Explorer',
      'Remove from Favourites',
    ]);
    expect(items.filter((item) => item.isDisabled).map((item) => item.id)).toEqual(['moveUp']);
  });

  it('offers the other groups and leaving the group for a grouped favourite', () => {
    const items = favouriteContextMenuItems(
      { canMoveUp: true, canMoveDown: true, groups, groupId: 'group-1', isFolder: false },
      translator,
    );
    const labels = items.map((item) => item.label);

    expect(labels).toContain('Move to Notes');
    expect(labels).not.toContain('Move to Specs');
    expect(labels).toContain('Remove from Group');
  });

  it('shows the keys for rename, move and remove', () => {
    const items = favouriteContextMenuItems(
      { canMoveUp: true, canMoveDown: true, groups: [], groupId: undefined, isFolder: false },
      translator,
    );

    expect(items.filter((item) => item.shortcut).map((item) => [item.id, item.shortcut])).toEqual([
      ['rename', 'F2'],
      ['moveUp', 'Alt+↑'],
      ['moveDown', 'Alt+↓'],
      ['remove', 'Delete'],
    ]);
  });

  it('offers to refresh a folder favourite', () => {
    const items = favouriteContextMenuItems(
      { canMoveUp: false, canMoveDown: false, groups: [], groupId: undefined, isFolder: true },
      translator,
    );

    expect(items.map((item) => item.id).slice(0, 2)).toEqual(['open', 'refresh']);
  });

  it('reads the group from a move item', () => {
    expect(groupIdOfMenuItem('moveToGroup:group-2')).toBe('group-2');
    expect(groupIdOfMenuItem('rename')).toBeUndefined();
  });
});
