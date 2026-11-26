import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { viewOptionMenus } from './viewOptionMenus';

const translator = createTranslator();

function menuWithId(id: string, settings = DEFAULT_VIEW_SETTINGS) {
  const menu = viewOptionMenus(settings, translator).find((candidate) => candidate.id === id);
  if (!menu) throw new Error(`no ${id} menu`);
  return menu;
}

describe('viewOptionMenus', () => {
  it('lists the Theme, Text Width and Document Style menus in that order', () => {
    const labels = viewOptionMenus(DEFAULT_VIEW_SETTINGS, translator).map((menu) => menu.label);

    expect(labels).toEqual(['Theme', 'Text Width', 'Document Style']);
  });

  it('checks exactly the current choice of each menu', () => {
    const settings = {
      ...DEFAULT_VIEW_SETTINGS,
      theme: 'sepia',
      readingWidth: 'full',
      typography: 'book',
    } as const;

    const checked = viewOptionMenus(settings, translator).map((menu) =>
      menu.items.filter((item) => item.isChecked).map((item) => item.id),
    );

    expect(checked).toEqual([['sepia'], ['full'], ['book']]);
  });

  it('turns a choice into the command that applies it', () => {
    expect(menuWithId('theme').commandFor('dark')).toEqual({ kind: 'setTheme', theme: 'dark' });
    expect(menuWithId('textWidth').commandFor('full')).toEqual({
      kind: 'setReadingWidth',
      readingWidth: 'full',
    });
    expect(menuWithId('documentStyle').commandFor('book')).toEqual({
      kind: 'setTypography',
      typography: 'book',
    });
  });

  it('gives no command for a choice the menu does not offer', () => {
    expect(menuWithId('theme').commandFor('full')).toBeUndefined();
    expect(menuWithId('textWidth').commandFor('dark')).toBeUndefined();
    expect(menuWithId('documentStyle').commandFor('')).toBeUndefined();
  });
});
