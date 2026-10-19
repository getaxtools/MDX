import { createTranslator, englishCatalog } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { encodingMenuItems, encodingNameKey, isReopenEncoding, REOPEN_ENCODINGS } from './reopenEncodings';

describe('reopen encodings', () => {
  it('names every encoding with a message from the catalog', () => {
    const missing = REOPEN_ENCODINGS.filter(
      (encoding) => !Object.hasOwn(englishCatalog, encodingNameKey(encoding)),
    );

    expect(missing).toEqual([]);
  });

  it('offers automatic detection first, then every encoding', () => {
    const items = encodingMenuItems(createTranslator());

    expect(items.map((item) => item.label).slice(0, 3)).toEqual([
      'Detect Automatically',
      'Unicode (UTF-8)',
      'Unicode (UTF-16 LE)',
    ]);
    expect(items).toHaveLength(REOPEN_ENCODINGS.length + 1);
  });

  it('recognises only the encodings it offers', () => {
    expect(isReopenEncoding('shift_jis')).toBe(true);
    expect(isReopenEncoding('klingon')).toBe(false);
  });
});
