import { createTranslator, englishCatalog } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import { STARTUP_TIPS, firstStartupTipIndex, startupTipText } from './startupTips';

const translator = createTranslator();

describe('startup tips', () => {
  it('names a shortcut from the shortcut table in every tip about a command', () => {
    for (const tip of STARTUP_TIPS.filter(({ command }) => command !== undefined)) {
      const shortcut = tip.command ? shortcutLabelFor(tip.command, translator) : undefined;

      expect(shortcut, tip.messageKey).toBeDefined();
      expect(startupTipText(tip, translator)).toContain(shortcut);
    }
  });

  it('leaves no placeholder unfilled', () => {
    const texts = STARTUP_TIPS.map((tip) => startupTipText(tip, translator));

    expect(texts.filter((text) => text.includes('{'))).toEqual([]);
  });

  it('names the keys in the display language', () => {
    const german = createTranslator({ locale: 'de', messages: { ...englishCatalog, 'keys.ctrl': 'Strg' } });

    const text = startupTipText(
      { messageKey: 'startup.tip.commandPalette', command: { kind: 'showCommandPalette' } },
      german,
    );

    expect(text).toContain('Strg+Shift+P');
  });

  it('starts the rotation at the tip the random fraction points to', () => {
    expect(firstStartupTipIndex(0)).toBe(0);
    expect(firstStartupTipIndex(0.5)).toBe(Math.floor(STARTUP_TIPS.length / 2));
    expect(firstStartupTipIndex(0.9999)).toBe(STARTUP_TIPS.length - 1);
  });
});
