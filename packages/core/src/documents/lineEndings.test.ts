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

  it('gives lines that replace others the most common kind in a document with mixed line breaks', () => {
    expect(withDocumentLineBreaks('a\nb', 'mixed', 'x\r\ny\r\nz\n')).toBe('a\r\nb');
    expect(withDocumentLineBreaks('a\nb', 'mixed', 'x\r\ny\nz\n')).toBe('a\nb');
  });

  it('keeps each line its own break when lines are edited in place in a mixed document', () => {
    expect(withDocumentLineBreaks('A\nb\nC\n', 'mixed', 'a\r\nb\nc\r\n')).toBe('A\r\nb\nC\r\n');
  });

  it('keeps old Mac breaks in a mixed document', () => {
    expect(withDocumentLineBreaks('a\nB\nc', 'mixed', 'a\rb\nc')).toBe('a\rB\nc');
  });

  it('keeps the breaks of the lines around an inserted line in a mixed document', () => {
    const original = 'a\r\nb\nc\r\nd\n';

    expect(withDocumentLineBreaks('a\nb\nnew\nc\nd\n', 'mixed', original)).toBe('a\r\nb\nnew\r\nc\r\nd\n');
  });

  it('keeps the breaks of the other lines when a line is removed from a mixed document', () => {
    expect(withDocumentLineBreaks('a\nc\nd\n', 'mixed', 'a\r\nb\nc\r\nd\n')).toBe('a\r\nc\r\nd\n');
  });

  it('leaves a mixed document unchanged when nothing was edited', () => {
    const original = 'a\r\nb\nc\rd\r\n';

    expect(withDocumentLineBreaks(withUnixLineBreaks(original), 'mixed', original)).toBe(original);
  });
});
