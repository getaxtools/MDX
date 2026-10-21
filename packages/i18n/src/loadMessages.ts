import { englishCatalog, type MessageCatalog, type MessageKey } from './createTranslator';
import { pseudoLocalize } from './pseudoLocalize';
import { PSEUDO_ACCENTED_LOCALE, PSEUDO_RIGHT_TO_LEFT_LOCALE } from './supportedLocales';

export type TranslatedCatalog = Partial<Record<MessageKey, string>>;
type CatalogLoader = () => Promise<TranslatedCatalog>;

/** Each translation loads only when chosen, so other languages never weigh on startup. */
const CATALOG_LOADERS: Readonly<Record<string, CatalogLoader>> = {
  hi: () => import('../locales/hi.json').then(({ default: messages }) => messages),
  te: () => import('../locales/te.json').then(({ default: messages }) => messages),
  kn: () => import('../locales/kn.json').then(({ default: messages }) => messages),
  ta: () => import('../locales/ta.json').then(({ default: messages }) => messages),
  bn: () => import('../locales/bn.json').then(({ default: messages }) => messages),
  mr: () => import('../locales/mr.json').then(({ default: messages }) => messages),
  es: () => import('../locales/es.json').then(({ default: messages }) => messages),
  fr: () => import('../locales/fr.json').then(({ default: messages }) => messages),
  de: () => import('../locales/de.json').then(({ default: messages }) => messages),
  'pt-BR': () => import('../locales/pt-BR.json').then(({ default: messages }) => messages),
  ru: () => import('../locales/ru.json').then(({ default: messages }) => messages),
  ja: () => import('../locales/ja.json').then(({ default: messages }) => messages),
  'zh-Hans': () => import('../locales/zh-Hans.json').then(({ default: messages }) => messages),
  ko: () => import('../locales/ko.json').then(({ default: messages }) => messages),
  ar: () => import('../locales/ar.json').then(({ default: messages }) => messages),
};

/** The messages for a locale; English fills in anything the translation does not have yet. */
export async function loadMessages(locale: string): Promise<MessageCatalog> {
  if (locale === PSEUDO_ACCENTED_LOCALE) return pseudoLocalize(englishCatalog, 'accented');
  if (locale === PSEUDO_RIGHT_TO_LEFT_LOCALE) return pseudoLocalize(englishCatalog, 'rightToLeft');
  const loader = Object.hasOwn(CATALOG_LOADERS, locale) ? CATALOG_LOADERS[locale] : undefined;
  if (!loader) return englishCatalog;
  return withEnglishFallback(await loader());
}

export function withEnglishFallback(translated: TranslatedCatalog): MessageCatalog {
  const filledIn = Object.entries(translated).filter(
    ([key, message]) => Object.hasOwn(englishCatalog, key) && typeof message === 'string' && message !== '',
  );
  return { ...englishCatalog, ...Object.fromEntries(filledIn) };
}
