import { describe, expect, it } from 'vitest';
import { formatFileSize, locationMovedInto } from './notesMove';

describe('formatFileSize', () => {
  it.each([
    [0, '0 byte'],
    [900, '900 byte'],
    [1_536, '1.5 kB'],
    [2 * 1024 ** 3, '2 GB'],
  ])('shows %i bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes, 'en')).toBe(expected);
  });
});

describe('locationMovedInto', () => {
  const from = { canonicalKey: 'c:\\users\\ana\\documents\\mdx notes' };
  const to = { displayPath: 'E:\\Notes' };

  it('keeps the path inside the moved folder', () => {
    const note = {
      canonicalKey: 'c:\\users\\ana\\documents\\mdx notes\\projects\\plan.md',
      displayPath: 'C:\\Users\\Ana\\Documents\\MDX Notes\\Projects\\Plan.md',
      fileName: 'Plan.md',
    };

    expect(locationMovedInto(note, from, to)).toEqual({
      canonicalKey: 'e:\\notes\\projects\\plan.md',
      displayPath: 'E:\\Notes\\Projects\\Plan.md',
      fileName: 'Plan.md',
    });
  });

  it('leaves a location outside the folder, even with a similar name', () => {
    const other = {
      canonicalKey: 'c:\\users\\ana\\documents\\mdx notes 2\\plan.md',
      displayPath: 'C:\\Users\\Ana\\Documents\\MDX Notes 2\\Plan.md',
      fileName: 'Plan.md',
    };

    expect(locationMovedInto(other, from, to)).toBeUndefined();
  });
});
