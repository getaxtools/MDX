import { describe, expect, it } from 'vitest';
import { createTranslator, englishCatalog, type MessageKey } from './createTranslator';

const MESSAGE_KEY_FORMAT = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z0-9]*)+$/;
const SAMPLE_VALUES = {
  count: 2,
  number: 1,
  minutes: 3,
  percent: 125,
  current: 1,
  total: 4,
  fileName: 'Guide.md',
  name: 'Specs',
  path: 'C:\\Docs\\Guide.md',
  encoding: 'UTF-8',
  lineEnding: 'LF',
  version: '1.0.0',
  year: 2026,
  url: 'https://example.com',
};

describe('createTranslator', () => {
  it('translates a simple message', () => {
    const translator = createTranslator();

    expect(translator.translate('favourites.sidebar.title')).toBe('Favourites');
  });

  it('fills in values', () => {
    const translator = createTranslator();

    expect(translator.translate('about.version', { version: '0.1.0' })).toBe('Version 0.1.0');
  });

  it('uses the right plural form', () => {
    const translator = createTranslator();

    expect(translator.translate('statusBar.words', { count: 1 })).toBe('1 word');
    expect(translator.translate('statusBar.words', { count: 1200 })).toBe('1,200 words');
  });

  it('defaults to English', () => {
    expect(createTranslator().locale).toBe('en');
  });

  it('formats every English message without errors', () => {
    const errors: Error[] = [];
    const translator = createTranslator({ onError: (error) => errors.push(error) });

    for (const key of Object.keys(englishCatalog) as MessageKey[]) translator.translate(key, SAMPLE_VALUES);

    expect(errors).toEqual([]);
  });

  it('names every key as feature.area.purpose', () => {
    const badlyNamedKeys = Object.keys(englishCatalog).filter((key) => !MESSAGE_KEY_FORMAT.test(key));

    expect(badlyNamedKeys).toEqual([]);
  });
});
