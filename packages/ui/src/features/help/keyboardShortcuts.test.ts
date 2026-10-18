import { createTranslator, englishCatalog } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { describeCombination, KEYBOARD_SHORTCUTS } from './keyboardShortcuts';

describe('keyboard shortcuts', () => {
  it('describes key combinations with translated modifier names', () => {
    expect(describeCombination(['ctrl', 'shift', 'T'], createTranslator())).toBe('Ctrl+Shift+T');
    expect(describeCombination(['F3'], createTranslator())).toBe('F3');
  });

  it('names every action with a message from the catalog', () => {
    const missing = KEYBOARD_SHORTCUTS.filter(
      (shortcut) => !Object.hasOwn(englishCatalog, shortcut.actionKey),
    );

    expect(missing).toEqual([]);
  });
});
