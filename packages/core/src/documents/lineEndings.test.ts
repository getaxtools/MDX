import { describe, expect, it } from 'vitest';
import { withDocumentLineBreaks, withUnixLineBreaks } from './lineEndings';

describe('line endings', () => {
  it('turns every kind of line break into \\n', () => {
    expect(withUnixLineBreaks('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('writes Windows line breaks back into a document that had them', () => {
    expect(withDocumentLineBreaks('a\nb\n', 'crlf', 'x\r\n')).toBe('a\r\nb\r\n');
  });

  it('keeps Unix line breaks', () => {
    expect(withDocumentLineBreaks('a\nb', 'lf', 'x\n')).toBe('a\nb');
  });

  it('uses the most common kind for a document with mixed line breaks', () => {
    expect(withDocumentLineBreaks('a\nb', 'mixed', 'x\r\ny\r\nz\n')).toBe('a\r\nb');
    expect(withDocumentLineBreaks('a\nb', 'mixed', 'x\r\ny\nz\n')).toBe('a\nb');
  });
});
