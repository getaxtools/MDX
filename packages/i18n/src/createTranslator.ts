import { createIntl, createIntlCache, type IntlShape } from '@formatjs/intl';
import englishMessages from '../locales/en.json' with { type: 'json' };
import { DEFAULT_LOCALE } from './supportedLocales';

export type MessageKey = keyof typeof englishMessages;
export type MessageCatalog = Readonly<Record<MessageKey, string>>;
export type MessageValues = Readonly<Record<string, string | number | Date>>;

export interface Translator {
  readonly locale: string;
  translate(key: MessageKey, values?: MessageValues): string;
}

export interface TranslatorOptions {
  readonly locale?: string;
  readonly messages?: MessageCatalog;
  readonly onError?: (error: Error) => void;
}

export function createTranslator({
  locale = DEFAULT_LOCALE,
  messages = englishMessages,
  onError,
}: TranslatorOptions = {}): Translator {
  const intl: IntlShape = createIntl(
    { locale, defaultLocale: DEFAULT_LOCALE, messages, ...(onError ? { onError } : {}) },
    createIntlCache(),
  );
  return {
    locale,
    translate: (key, values) => intl.formatMessage({ id: key }, values),
  };
}

export const englishCatalog: MessageCatalog = englishMessages;
