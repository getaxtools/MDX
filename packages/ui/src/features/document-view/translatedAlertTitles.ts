import type { Translator } from '@mdx/i18n';
import { CALLOUT_TYPES, type AlertTitles, type CalloutType } from '@mdx/renderer';

/** The titles of callouts such as `[!NOTE]` and `[!danger]` in the language of the app. */
export function translatedAlertTitles(translator: Translator): AlertTitles {
  const titles = CALLOUT_TYPES.map((type): [CalloutType, string] => [
    type,
    translator.translate(`document.alert.${type}`),
  ]);
  return Object.fromEntries(titles) as Record<CalloutType, string>;
}
