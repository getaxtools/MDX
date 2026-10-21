import { describe, expect, it } from 'vitest';
import { createTranslator, englishCatalog } from './createTranslator';
import { pseudoLocalize, pseudoLocalizeMessage } from './pseudoLocalize';

describe('pseudoLocalizeMessage', () => {
  it('accents letters, marks the ends and makes the text 40% longer', () => {
    expect(pseudoLocalizeMessage('Open', 'accented')).toBe('[Öpéñ~~]');
  });

  it('keeps placeholders and plural keywords working', () => {
    const message = '{count, plural, one {# file} other {# files}} in {name}';
    const translator = createTranslator({
      locale: 'en-XA',
      messages: { ...englishCatalog, 'favourites.sidebar.title': pseudoLocalizeMessage(message, 'accented') },
    });

    const formatted = translator.translate('favourites.sidebar.title', { count: 2, name: 'Docs' });

    expect(formatted).toMatch(/^\[2 fílés íñ Docs~+\]$/);
  });

  it('wraps right-to-left text in direction marks', () => {
    expect(pseudoLocalizeMessage('Open', 'rightToLeft')).toBe('\u202EOpen\u202C');
  });
});

describe('pseudoLocalize', () => {
  it('produces a catalog that formats every message with real values', () => {
    const translator = createTranslator({
      locale: 'en-XA',
      messages: pseudoLocalize(englishCatalog, 'accented'),
      onError: (error) => {
        throw error;
      },
    });

    expect(translator.translate('about.version', { version: '1.0.0' })).toBe('[Vérsíóñ 1.0.0~~~~~~~]');
    expect(Object.keys(pseudoLocalize(englishCatalog, 'rightToLeft'))).toEqual(Object.keys(englishCatalog));
  });
});
