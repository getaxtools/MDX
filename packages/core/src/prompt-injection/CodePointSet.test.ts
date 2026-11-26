import { describe, expect, it } from 'vitest';
import {
  CodePointSet,
  formatCodePoint,
  InvalidCodePointNotationError,
  parseCodePointNotation,
} from './CodePointSet';

describe('CodePointSet', () => {
  it('contains single code points and the ends of ranges', () => {
    const set = CodePointSet.fromNotations(['U+200B', 'U+2060..U+2064', 'U+E0000..U+E007F']);

    expect(set.has(0x200b)).toBe(true);
    expect(set.has(0x2060)).toBe(true);
    expect(set.has(0x2064)).toBe(true);
    expect(set.has(0xe0041)).toBe(true);
    expect(set.has(0x2065)).toBe(false);
    expect(set.has(0x41)).toBe(false);
  });

  it('merges overlapping and touching ranges', () => {
    const set = CodePointSet.union([
      CodePointSet.fromNotations(['U+0041..U+0045']),
      CodePointSet.fromNotations(['U+0046', 'U+0043..U+0050']),
    ]);

    expect(set.has(0x41)).toBe(true);
    expect(set.has(0x46)).toBe(true);
    expect(set.has(0x50)).toBe(true);
    expect(set.has(0x51)).toBe(false);
  });

  it.each(['200B', 'U+20', 'U+0041..U+0040', 'U+110000', 'U+0041..U+0042..U+0043'])(
    'rejects the malformed notation %s',
    (notation) => {
      expect(() => CodePointSet.fromNotations([notation])).toThrow(InvalidCodePointNotationError);
    },
  );

  it('reads and writes the U+ notation', () => {
    expect(parseCodePointNotation('U+1F3F4')).toBe(0x1f3f4);
    expect(formatCodePoint(0x200b)).toBe('U+200B');
    expect(formatCodePoint(0xe0041)).toBe('U+E0041');
  });
});
