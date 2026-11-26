import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { editorSpellCheckOf } from './editorSpellCheck';

describe('editorSpellCheckOf', () => {
  it('follows the setting for each mode', () => {
    expect(editorSpellCheckOf(DEFAULT_VIEW_SETTINGS, false)).toEqual({
      isInRichText: true,
      isInSource: false,
    });
    expect(
      editorSpellCheckOf({ isSpellCheckedInRichText: false, isSpellCheckedInSource: true }, false),
    ).toEqual({ isInRichText: false, isInSource: true });
  });

  it('protected document never enables spelling', () => {
    expect(
      editorSpellCheckOf({ isSpellCheckedInRichText: true, isSpellCheckedInSource: true }, true),
    ).toEqual({ isInRichText: false, isInSource: false });
  });
});
