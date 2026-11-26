import { describe, expect, it } from 'vitest';
import { isTooLargeForRichText, MAX_RICH_TEXT_DOCUMENT_BYTES, utf8ByteLength } from './richTextSizeLimit';

describe('the Rich text size limit', () => {
  it('counts the UTF-8 bytes a document takes', () => {
    expect(utf8ByteLength('a')).toBe(1);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('日')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('1 MB plus one byte opens in Source', () => {
    const atTheLimit = 'a'.repeat(MAX_RICH_TEXT_DOCUMENT_BYTES);

    expect(isTooLargeForRichText(atTheLimit)).toBe(false);
    expect(isTooLargeForRichText(`${atTheLimit}a`)).toBe(true);
    expect(isTooLargeForRichText(`${'a'.repeat(MAX_RICH_TEXT_DOCUMENT_BYTES - 1)}é`)).toBe(true);
  });
});
