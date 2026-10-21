import { savedLanguagePreference } from '@mdx/core';
import {
  createTranslator,
  directionOf,
  displayLocaleFor,
  loadMessages,
  type MessageCatalog,
  type Translator,
} from '@mdx/i18n';

export interface DisplayLanguage {
  readonly locale: string;
  readonly messages: MessageCatalog;
  readonly translator: Translator;
}

export interface DisplayLanguageSources {
  /** The saved app state, which holds the language chosen in Settings. */
  readonly savedState: unknown;
  /** The languages the system prefers, most preferred first, such as `navigator.languages`. */
  readonly systemLocales: readonly string[];
  /** The page root, which gets the language and text direction. */
  readonly root: HTMLElement;
}

/** Picks and loads the display language, and marks the page with its language and direction. */
export async function prepareDisplayLanguage({
  savedState,
  systemLocales,
  root,
}: DisplayLanguageSources): Promise<DisplayLanguage> {
  const locale = displayLocaleFor(savedLanguagePreference(savedState), systemLocales);
  const messages = await loadMessages(locale);
  root.lang = locale;
  root.dir = directionOf(locale);
  return { locale, messages, translator: createTranslator({ locale, messages }) };
}
