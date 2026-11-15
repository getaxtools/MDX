import type { DocumentLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { isNoteOrChildAmong, locationAfterNoteMove } from './noteMoves';

function at(displayPath: string): DocumentLocation {
  return {
    canonicalKey: displayPath.toLowerCase(),
    displayPath,
    fileName: displayPath.split('\\').at(-1) ?? displayPath,
  };
}

const MOVE = { from: at('C:\\Notes\\Projects.md'), to: at('C:\\Notes\\Archive\\Work.md') };

describe('note moves', () => {
  it('the note itself goes to its new place', () => {
    expect(locationAfterNoteMove(at('C:\\Notes\\Projects.md'), MOVE)).toEqual(MOVE.to);
  });

  it('a child note follows its parent into the renamed folder', () => {
    expect(locationAfterNoteMove(at('C:\\Notes\\Projects\\Plan\\Step.md'), MOVE)).toEqual(
      at('C:\\Notes\\Archive\\Work\\Plan\\Step.md'),
    );
  });

  it('other documents stay, including a sibling whose name starts the same', () => {
    expect(locationAfterNoteMove(at('C:\\Notes\\Projects 2.md'), MOVE)).toBeUndefined();
    expect(locationAfterNoteMove(at('C:\\Notes\\Projects 2\\Plan.md'), MOVE)).toBeUndefined();
  });

  it('knows when the note or a child note has unsaved changes', () => {
    expect(isNoteOrChildAmong(MOVE.from, ['c:\\notes\\projects\\plan.md'])).toBe(true);
    expect(isNoteOrChildAmong(MOVE.from, ['c:\\notes\\projects.md'])).toBe(true);
    expect(isNoteOrChildAmong(MOVE.from, ['c:\\notes\\projects 2.md'])).toBe(false);
  });
});
