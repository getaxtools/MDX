import type { Translator } from '@mdx/i18n';
import { ALERT_KINDS, type AlertKind, type AlertTitles } from '@mdx/renderer';

/** The titles of GitHub alerts such as `[!NOTE]` in the language of the app. */
export function translatedAlertTitles(translator: Translator): AlertTitles {
  const titles = ALERT_KINDS.map((kind): [AlertKind, string] => [
    kind,
    translator.translate(`document.alert.${kind}`),
  ]);
  return Object.fromEntries(titles) as Record<AlertKind, string>;
}
