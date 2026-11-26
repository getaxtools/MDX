import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCharacterReferences, findCharacterReferences } from './decodeCharacterReferences';
import { decodeTagCharacters } from './decodeTagCharacters';
import { decodeVariationSelectorBytes, describeBytes } from './decodeVariationSelectorPayload';

const PROPERTY_TEST_TIMEOUT_MS = 30_000;

const printableAscii = fc.string({
  unit: fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code)),
});

function asTagCharacters(ascii: string): string {
  return Array.from(ascii, (character) =>
    String.fromCodePoint(0xe0000 + (character.codePointAt(0) ?? 0)),
  ).join('');
}

function asVariationSelectorCodePoints(bytes: Uint8Array): number[] {
  return [...bytes].map((byte) => (byte < 16 ? 0xfe00 + byte : 0xe0100 + byte - 16));
}

describe('decodeTagCharacters', () => {
  it('returns the ASCII text that was encoded as tag characters', () => {
    fc.assert(
      fc.property(printableAscii, (ascii) => {
        expect(decodeTagCharacters(asTagCharacters(ascii))).toBe(ascii);
      }),
    );
  });

  it('leaves out other characters and tags without a printable twin', () => {
    expect(decodeTagCharacters(`a\u{E0001}${asTagCharacters('ok')}\u{E007F}`)).toBe('ok');
  });
});

describe('decodeVariationSelectorBytes', () => {
  it('returns the bytes that were encoded as variation selectors', () => {
    fc.assert(
      fc.property(fc.uint8Array(), (bytes) => {
        expect(decodeVariationSelectorBytes(asVariationSelectorCodePoints(bytes))).toEqual(bytes);
      }),
    );
  });

  it('describes readable UTF-8 as text and anything else as hexadecimal', () => {
    expect(describeBytes(new TextEncoder().encode('café 日本'))).toBe('café 日本');
    expect(describeBytes(Uint8Array.from([0xc3, 0x28]))).toBe('c3 28');
    expect(describeBytes(Uint8Array.from([1, 2, 3]))).toBe('01 02 03');
  });
});

describe('decodeCharacterReferences', () => {
  it(
    'returns any text that was written as numeric character references',
    () => {
      fc.assert(
        fc.property(fc.string({ unit: 'binary' }), fc.boolean(), (text, isHexadecimal) => {
          const encoded = Array.from(text, (character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return isHexadecimal ? `&#x${codePoint.toString(16)};` : `&#${String(codePoint)};`;
          }).join('');

          expect(decodeCharacterReferences(encoded)).toBe(text);
        }),
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  it('decodes named references for invisible characters and leaves unknown names alone', () => {
    expect(decodeCharacterReferences('a&zwj;b&ZeroWidthSpace;c&copy;')).toBe('a\u200Db\u200Bc&copy;');
  });

  it('finds the exact range of each reference', () => {
    expect(findCharacterReferences('x&#8203;y&lrm;')).toEqual([
      { from: 1, to: 8, codePoint: 0x200b },
      { from: 9, to: 14, codePoint: 0x200e },
    ]);
  });

  it('ignores references beyond the last code point', () => {
    expect(findCharacterReferences('&#x110000; &#9999999;')).toEqual([]);
  });
});
