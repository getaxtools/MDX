import { createTranslator, englishCatalog } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { describeCombination } from '../shortcuts/describeCombination';
import { KEYBOARD_SHORTCUTS } from './keyboardShortcuts';

describe('keyboard shortcuts', () => {
  it('describes key combinations with translated modifier and mouse names', () => {
    const translator = createTranslator();

    expect(describeCombination(['ctrl', 'shift', 'T'], translator)).toBe('Ctrl+Shift+T');
    expect(describeCombination(['F3'], translator)).toBe('F3');
    expect(describeCombination(['ctrl', 'wheel'], translator)).toBe('Ctrl+Mouse wheel');
  });

  it('lists every action once, named with a message from the catalog', () => {
    const actionKeys = KEYBOARD_SHORTCUTS.map((shortcut) => shortcut.actionKey);

    expect(actionKeys.filter((key) => !Object.hasOwn(englishCatalog, key))).toEqual([]);
    expect(new Set(actionKeys).size).toBe(actionKeys.length);
  });
});
