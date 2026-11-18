/**
 * What the app needs from the editor before the editor is opened, without the editor's code: the
 * words it shows, for the app to translate, and the kinds the block menu offers. The editor itself
 * loads on first use.
 */
export { BLOCK_HANDLE_PHRASE, BLOCK_KIND_PHRASES, BLOCK_MOVE_PHRASES } from './blockPhrases';
export type { BlockKind } from '../blocks/markdownBlocks';
export { TURN_INTO_KINDS, type TurnIntoKind } from './turnIntoKinds';
export { FORMULA_PASTE_PHRASES } from './formulaPastePhrases';
export { CALLOUT_TYPE_PHRASE } from './calloutPhrases';
export { SLASH_ITEM_TEXTS, type SlashItemText } from './slashItemTexts';
export { SLASH_MENU_SECTION } from './slashMenuPhrases';
export { SNIPPETS_SECTION } from './snippetPhrases';
