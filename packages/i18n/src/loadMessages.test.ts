import { describe, expect, it } from 'vitest';
import { englishCatalog } from './createTranslator';
import { loadMessages, withEnglishFallback } from './loadMessages';
import { SUPPORTED_LOCALES } from './supportedLocales';

describe('loadMessages', () => {
  it('loads a translation for every language offered in Settings', async () => {
    for (const { tag } of SUPPORTED_LOCALES) {
      const messages = await loadMessages(tag);

      expect(Object.keys(messages)).toHaveLength(Object.keys(englishCatalog).length);
    }
  });

  it('loads the Hindi menus in Hindi', async () => {
    const messages = await loadMessages('hi');

    expect(messages['menu.file']).not.toBe(englishCatalog['menu.file']);
  });

  it('uses English for an unknown language', async () => {
    expect(await loadMessages('xx')).toBe(englishCatalog);
  });

  it('builds the pseudo-locales from English', async () => {
    expect((await loadMessages('en-XA'))['menu.file']).toMatch(/^\[Fílé~+\]$/);
    expect((await loadMessages('ar-XB'))['menu.file']).toBe('‮File‬');
  });
});

describe('withEnglishFallback', () => {
  it('keeps English for messages a translation lacks, leaves empty or blank, or does not know', () => {
    const messages = withEnglishFallback({ 'menu.file': 'Fichier', 'menu.edit': '' });

    expect(messages['menu.file']).toBe('Fichier');
    expect(messages['menu.edit']).toBe('Edit');
    expect(messages['menu.view']).toBe('View');
  });
});
