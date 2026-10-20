import type { MessageKey, Translator } from '@mdx/i18n';

/** CodeMirror's own English words, mapped to the app's message keys. */
const PHRASE_KEYS: Readonly<Record<string, MessageKey>> = {
  Find: 'editor.phrase.find',
  Replace: 'editor.phrase.replace',
  next: 'editor.phrase.next',
  previous: 'editor.phrase.previous',
  all: 'editor.phrase.all',
  'match case': 'editor.phrase.matchCase',
  regexp: 'editor.phrase.regexp',
  'by word': 'editor.phrase.byWord',
  replace: 'editor.phrase.replace',
  'replace all': 'editor.phrase.replaceAll',
  close: 'editor.phrase.close',
  'Go to line': 'editor.phrase.goToLine',
  go: 'editor.phrase.go',
  'current match': 'editor.phrase.currentMatch',
  'on line': 'editor.phrase.onLine',
  'replaced match on line $': 'editor.phrase.replacedMatch',
  'replaced $ matches': 'editor.phrase.replacedMatches',
};

export function editorPhrases(translator: Translator): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PHRASE_KEYS).map(([phrase, key]) => [phrase, translator.translate(key)]),
  );
}
