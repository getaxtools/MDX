import type { ViewSettings } from '@mdx/core';
import type { SpellCheckSettings } from '@mdx/editor';
import type { DocumentLocation } from '@mdx/platform';

/**
 * Tells whether a document belongs to a protected section. Protected notes supply the real rule;
 * until then no document is protected.
 */
export interface ProtectedDocuments {
  isProtected(location: DocumentLocation): boolean;
}

export const NO_PROTECTED_DOCUMENTS: ProtectedDocuments = { isProtected: () => false };

const NO_SPELL_CHECK: SpellCheckSettings = { isInRichText: false, isInSource: false };

/**
 * What the editor checks: the setting for each mode, except in a protected document, whose words
 * must never reach the operating system's dictionary through Add to dictionary.
 */
export function editorSpellCheckOf(
  viewSettings: Pick<ViewSettings, 'isSpellCheckedInRichText' | 'isSpellCheckedInSource'>,
  isProtectedDocument: boolean,
): SpellCheckSettings {
  if (isProtectedDocument) return NO_SPELL_CHECK;
  return {
    isInRichText: viewSettings.isSpellCheckedInRichText,
    isInSource: viewSettings.isSpellCheckedInSource,
  };
}
