import {
  BLOCK_KIND_PHRASES,
  BLOCK_MOVE_PHRASES,
  BUILT_IN_SLASH_ITEMS,
  SLASH_MENU_SECTION,
  SNIPPETS_SECTION,
  type BlockKind,
} from '@mdx/editor';
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
  [BLOCK_MOVE_PHRASES.movedUp]: 'editor.block.movedUp',
  [BLOCK_MOVE_PHRASES.movedDown]: 'editor.block.movedDown',
  [BLOCK_MOVE_PHRASES.first]: 'editor.block.first',
  [BLOCK_MOVE_PHRASES.last]: 'editor.block.last',
  ...blockKindPhraseKeys(),
  [SLASH_MENU_SECTION]: 'editor.slash.section.blocks',
  [SNIPPETS_SECTION]: 'editor.slash.section.snippets',
  ...slashItemPhraseKeys(),
};

function slashItemPhraseKeys(): Record<string, MessageKey> {
  const entries = BUILT_IN_SLASH_ITEMS.flatMap(({ id, name, description }) => [
    [name, `editor.slash.item.${id}.name`],
    [description, `editor.slash.item.${id}.description`],
  ]);
  return Object.fromEntries(entries) as Record<string, MessageKey>;
}

function blockKindPhraseKeys(): Record<string, MessageKey> {
  const entries = Object.entries(BLOCK_KIND_PHRASES).map(([kind, phrase]) => [
    phrase,
    `editor.block.kind.${kind as BlockKind}` as const,
  ]);
  return Object.fromEntries(entries) as Record<string, MessageKey>;
}

export function editorPhrases(translator: Translator): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PHRASE_KEYS).map(([phrase, key]) => [phrase, translator.translate(key)]),
  );
}
