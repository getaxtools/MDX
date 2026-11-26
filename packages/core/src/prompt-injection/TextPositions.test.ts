import { describe, expect, it } from 'vitest';
import { TextPositions } from './TextPositions';

describe('TextPositions', () => {
  it('counts LF, CRLF and a lone CR as line breaks, like the source editor', () => {
    const positions = TextPositions.of('one\ntwo\r\nthree\rfour');

    expect(positions.lineCount()).toBe(4);
    expect(positions.positionOf(0)).toEqual({ line: 0, column: 0 });
    expect(positions.positionOf(5)).toEqual({ line: 1, column: 1 });
    expect(positions.positionOf(9)).toEqual({ line: 2, column: 0 });
    expect(positions.positionOf(15)).toEqual({ line: 3, column: 0 });
  });

  it('ends a line before its line break', () => {
    const positions = TextPositions.of('one\r\ntwo\nthree');

    expect(positions.lineEnd(0)).toBe(3);
    expect(positions.lineEnd(1)).toBe(8);
    expect(positions.lineEnd(2)).toBe(14);
  });

  it('places the end of the text on the last line', () => {
    const positions = TextPositions.of('one\n');

    expect(positions.positionOf(4)).toEqual({ line: 1, column: 0 });
  });
});
