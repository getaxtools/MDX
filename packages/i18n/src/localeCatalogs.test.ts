import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';
import { englishCatalog } from './createTranslator';
import { SUPPORTED_LOCALES } from './supportedLocales';

const LOCALES_FOLDER = join(import.meta.dirname, '..', 'locales');
const translationFiles = readdirSync(LOCALES_FOLDER).filter(
  (file) => file.endsWith('.json') && file !== 'en.json',
);

function readCatalog(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_FOLDER, file), 'utf8')) as Record<string, unknown>;
}

/** The names of the values a message needs, such as `count` in `{count, plural, ...}`. */
function argumentNamesOf(message: string): string[] {
  const names = new Set<string>();
  const visit = (elements: readonly MessageFormatElement[]) => {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
      names.add(element.value);
      if (element.type === TYPE.plural || element.type === TYPE.select)
        for (const option of Object.values(element.options)) visit(option.value);
      if (element.type === TYPE.tag) visit(element.children);
    }
  };
  visit(parse(message));
  return [...names].sort();
}

describe('locale catalogs', () => {
  it('lists every translation in Settings, and offers no language without one', () => {
    const translatedTags = translationFiles.map((file) => file.replace(/\.json$/, '')).sort();
    const offeredTags = SUPPORTED_LOCALES.map(({ tag }) => tag).filter((tag) => tag !== 'en');

    expect(offeredTags.sort()).toEqual(translatedTags);
  });

  describe.each(translationFiles)('%s', (file) => {
    const catalog = readCatalog(file);

    it('only translates messages that English has, as text', () => {
      const unknownKeys = Object.keys(catalog).filter((key) => !Object.hasOwn(englishCatalog, key));
      const nonText = Object.entries(catalog).filter(([, message]) => typeof message !== 'string');

      expect(unknownKeys).toEqual([]);
      expect(nonText).toEqual([]);
    });

    it('keeps the same placeholders as English in valid ICU messages', () => {
      const mismatches = Object.entries(catalog).flatMap(([key, message]) => {
        const english = englishCatalog[key as keyof typeof englishCatalog];
        const translated = argumentNamesOf(String(message));
        return translated.join() === argumentNamesOf(english).join() ? [] : [{ key, translated }];
      });

      expect(mismatches).toEqual([]);
    });
  });
});
