import type { EditingMode } from '../editing-mode/editingMode';

/** Whether the operating system marks misspelled words, set for each mode. */
export interface SpellCheckSettings {
  readonly isInRichText: boolean;
  readonly isInSource: boolean;
}

export const SPELL_CHECK_OFF: SpellCheckSettings = { isInRichText: false, isInSource: false };

export function isSpellCheckOnIn(settings: SpellCheckSettings, mode: EditingMode): boolean {
  return mode === 'richText' ? settings.isInRichText : settings.isInSource;
}
