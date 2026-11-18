import { describe, expect, it } from 'vitest';
import { BUILT_IN_SLASH_ITEMS } from '../slash-menu/slashMenuItems';
import { SLASH_ITEM_TEXTS } from './slashItemTexts';

describe('the words the app reads before the editor loads', () => {
  it('every insert menu item has its words and its Markdown, in the same order', () => {
    expect(
      BUILT_IN_SLASH_ITEMS.map(({ id, name, description, aliases }) => ({ id, name, description, aliases })),
    ).toEqual(SLASH_ITEM_TEXTS);
  });
});
