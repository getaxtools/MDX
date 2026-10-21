import { describe, expect, it } from 'vitest';
import {
  directionOf,
  displayLocaleFor,
  isKnownLocale,
  matchLocale,
  type SupportedLocale,
} from './supportedLocales';

const LOCALES: readonly SupportedLocale[] = [
  { tag: 'en', nativeName: 'English', direction: 'ltr' },
  { tag: 'hi', nativeName: 'हिन्दी', direction: 'ltr' },
  { tag: 'pt-BR', nativeName: 'Português (Brasil)', direction: 'ltr' },
  { tag: 'zh-Hans', nativeName: '简体中文', direction: 'ltr' },
  { tag: 'ar', nativeName: 'العربية', direction: 'rtl' },
];

describe('matchLocale', () => {
  it('picks the exact language, ignoring case', () => {
    expect(matchLocale(['HI'], LOCALES)).toBe('hi');
  });

  it('falls back from a regional variant to its base language', () => {
    expect(matchLocale(['hi-IN'], LOCALES)).toBe('hi');
    expect(matchLocale(['ar-EG'], LOCALES)).toBe('ar');
  });

  it('maps Simplified Chinese regions and plain Portuguese to the supported variant', () => {
    expect(matchLocale(['zh-CN'], LOCALES)).toBe('zh-Hans');
    expect(matchLocale(['zh-Hans-CN'], LOCALES)).toBe('zh-Hans');
    expect(matchLocale(['pt-PT'], LOCALES)).toBe('pt-BR');
  });

  it('tries each preferred language in order', () => {
    expect(matchLocale(['fy-NL', 'ar-SA', 'en-US'], LOCALES)).toBe('ar');
  });

  it('uses English when nothing matches', () => {
    expect(matchLocale(['sw-KE'], LOCALES)).toBe('en');
    expect(matchLocale([], LOCALES)).toBe('en');
  });
});

describe('directionOf', () => {
  it('reads Arabic and the right-to-left pseudo-locale from right to left', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('ar-XB')).toBe('rtl');
    expect(directionOf('hi')).toBe('ltr');
    expect(directionOf('en-XA')).toBe('ltr');
  });
});

describe('isKnownLocale', () => {
  it('knows English and the pseudo-locales, not made-up tags', () => {
    expect(isKnownLocale('en')).toBe(true);
    expect(isKnownLocale('en-XA')).toBe(true);
    expect(isKnownLocale('xx')).toBe(false);
  });
});

describe('displayLocaleFor', () => {
  it('uses the language chosen in Settings', () => {
    expect(displayLocaleFor('en-XA', ['fr-FR'])).toBe('en-XA');
  });

  it('follows the system languages when Settings says so or names an unknown language', () => {
    expect(displayLocaleFor('system', ['en-GB'])).toBe('en');
    expect(displayLocaleFor('xx', ['en-GB'])).toBe('en');
  });
});
