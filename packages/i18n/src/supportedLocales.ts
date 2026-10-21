export type TextDirection = 'ltr' | 'rtl';

export interface SupportedLocale {
  readonly tag: string;
  /** The language's name in that language, as shown in the language list. */
  readonly nativeName: string;
  readonly direction: TextDirection;
}

export const DEFAULT_LOCALE = 'en';

/** Accented, 40% longer English, for finding cut-off text and strings missing from the catalog. */
export const PSEUDO_ACCENTED_LOCALE = 'en-XA';
/** English shown right to left, for checking the mirrored layout without reading Arabic. */
export const PSEUDO_RIGHT_TO_LEFT_LOCALE = 'ar-XB';

export const PSEUDO_LOCALES: readonly string[] = [PSEUDO_ACCENTED_LOCALE, PSEUDO_RIGHT_TO_LEFT_LOCALE];

const RIGHT_TO_LEFT_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur']);

/** Languages that can be chosen in Settings, in the order they are listed. */
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  { tag: 'en', nativeName: 'English', direction: 'ltr' },
  { tag: 'hi', nativeName: 'हिन्दी', direction: 'ltr' },
  { tag: 'te', nativeName: 'తెలుగు', direction: 'ltr' },
  { tag: 'kn', nativeName: 'ಕನ್ನಡ', direction: 'ltr' },
  { tag: 'ta', nativeName: 'தமிழ்', direction: 'ltr' },
  { tag: 'bn', nativeName: 'বাংলা', direction: 'ltr' },
  { tag: 'mr', nativeName: 'मराठी', direction: 'ltr' },
  { tag: 'es', nativeName: 'Español', direction: 'ltr' },
  { tag: 'fr', nativeName: 'Français', direction: 'ltr' },
  { tag: 'de', nativeName: 'Deutsch', direction: 'ltr' },
  { tag: 'pt-BR', nativeName: 'Português (Brasil)', direction: 'ltr' },
  { tag: 'ru', nativeName: 'Русский', direction: 'ltr' },
  { tag: 'ja', nativeName: '日本語', direction: 'ltr' },
  { tag: 'zh-Hans', nativeName: '简体中文', direction: 'ltr' },
  { tag: 'ko', nativeName: '한국어', direction: 'ltr' },
  { tag: 'ar', nativeName: 'العربية', direction: 'rtl' },
];

export function directionOf(locale: string): TextDirection {
  if (locale === PSEUDO_RIGHT_TO_LEFT_LOCALE) return 'rtl';
  return RIGHT_TO_LEFT_LANGUAGES.has(baseLanguageOf(locale)) ? 'rtl' : 'ltr';
}

export function isKnownLocale(locale: string): boolean {
  return PSEUDO_LOCALES.includes(locale) || SUPPORTED_LOCALES.some(({ tag }) => tag === locale);
}

/** Script and region variants that read best in one of the supported locales. */
const EQUIVALENT_LOCALES: Readonly<Record<string, string>> = {
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-hans-cn': 'zh-Hans',
  zh: 'zh-Hans',
  pt: 'pt-BR',
};

/**
 * The first supported locale for the user's preferred languages, such as the ones Windows lists:
 * the exact tag, then a known equivalent, then the base language, else English.
 */
export function matchLocale(
  preferredLocales: readonly string[],
  supportedLocales: readonly SupportedLocale[] = SUPPORTED_LOCALES,
): string {
  for (const preferred of preferredLocales) {
    const match = supportedMatchFor(preferred, supportedLocales);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** The locale to show: the one chosen in Settings, or the best match for the system languages. */
export function displayLocaleFor(preference: string, systemLocales: readonly string[]): string {
  return preference !== 'system' && isKnownLocale(preference) ? preference : matchLocale(systemLocales);
}

function supportedMatchFor(
  preferred: string,
  supportedLocales: readonly SupportedLocale[],
): string | undefined {
  const lowerCase = preferred.toLowerCase();
  const candidates = [lowerCase, EQUIVALENT_LOCALES[lowerCase], baseLanguageOf(lowerCase)];
  for (const candidate of candidates) {
    const equivalent = candidate === undefined ? undefined : (EQUIVALENT_LOCALES[candidate] ?? candidate);
    const supported = supportedLocales.find(({ tag }) => tag.toLowerCase() === equivalent?.toLowerCase());
    if (supported) return supported.tag;
  }
  return undefined;
}

function baseLanguageOf(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() ?? locale;
}
