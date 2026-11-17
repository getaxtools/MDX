import { describe, expect, it } from 'vitest';
import { createTranslator, englishCatalog, type MessageKey } from './createTranslator';

const MESSAGE_KEY_FORMAT = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z0-9]*)+$/;
const SAMPLE_VALUES = {
  count: 2,
  number: 1,
  source: 'x^2',
  rows: 3,
  columns: 2,
  type: 'mermaid',
  mode: 'richText',
  level: 'Heading 2',
  message: "Expected '}'",
  position: 9,
  limit: 10_000,
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
  shortcut: 'Ctrl+Shift+P',
  group: 'Theme',
  action: 'Dark',
  section: 'Favourites',
  license: 'MIT',
  year: 2026,
  url: 'https://example.com',
  address: 'example.com/project',
  query: 'theme',
  matches: 3,
  documents: 2,
  kind: 'Notes',
  turnedOffKind: 'Spec viewer',
  keys: 'Ctrl+S',
  words: 120,
  goal: 500,
  names: 'guide.md - Handbook',
  app: 'MDX',
  folder: 'Projects › Work',
  date: 'Nov 14, 2026, 9:30 AM',
  indexed: 120,
  links: 3,
  notes: 2,
  notUpdated: 1,
  indexing: 'yes',
  severity: 'High',
  rule: 'HTML comment',
  line: 12,
  column: 4,
  target: 'E:\\Notes',
  size: '2 MB',
  required: '2.2 GB',
  available: '1 GB',
  done: 600,
  paths: 'Plan.md, Ideas.md',
  recycled: 3,
  expected: 1240,
  found: 1241,
  note: 'Plan.md',
  wanted: 'Plan.md',
  savedAs: 'Plan (imported).md',
  detail: 'Plan#^a1b2',
  entry: 'install.md, 3 of 12',
  when: 'yesterday',
  ctrl: 'Ctrl',
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
