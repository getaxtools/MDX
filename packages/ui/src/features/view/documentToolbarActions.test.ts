import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_TOOLBAR_ISLANDS, isDocumentButton, moreOptionsItems } from './documentToolbarActions';

const translator = createTranslator();
const state = {
  viewSettings: DEFAULT_VIEW_SETTINGS,
  hasDocument: true,
  canBeFavourite: true,
  isFavourite: true,
  isEditing: false,
};

describe('moreOptionsItems', () => {
  it('lists every action of the hidden islands in toolbar order', () => {
    const items = moreOptionsItems(DOCUMENT_TOOLBAR_ISLANDS, state, translator);

    expect(items.map((item) => item.id)).toEqual(DOCUMENT_TOOLBAR_ISLANDS.flat());
  });

  it('puts a separator before the first action of each island after the first', () => {
    const items = moreOptionsItems(DOCUMENT_TOOLBAR_ISLANDS, state, translator);

    const separated = items.filter((item) => item.hasSeparatorBefore).map((item) => item.id);
    expect(separated).toEqual(['editing', 'theme']);
  });

  it('gives a button its shortcut and whether it is on', () => {
    const [open, favourite] = moreOptionsItems(DOCUMENT_TOOLBAR_ISLANDS.slice(0, 1), state, translator);

    expect(open?.shortcut).toBe('Ctrl+O');
    expect(favourite?.isChecked).toBe(true);
  });

  it('lists nothing while every island is shown', () => {
    expect(moreOptionsItems([], state, translator)).toEqual([]);
  });
});

describe('isDocumentButton', () => {
  it('tells the toolbar buttons from the view option menus', () => {
    expect(isDocumentButton('editing')).toBe(true);
    expect(isDocumentButton('theme')).toBe(false);
  });
});
