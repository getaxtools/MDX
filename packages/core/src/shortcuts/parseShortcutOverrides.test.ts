import { describe, expect, it } from 'vitest';
import { parseShortcutOverrides } from './parseShortcutOverrides';

describe('parseShortcutOverrides', () => {
  it('keeps a valid combination per command id', () => {
    const saved = { toggleControlWheel: ['ctrl', 'shift', 'J'] };

    expect(parseShortcutOverrides(saved)).toEqual({ toggleControlWheel: ['ctrl', 'shift', 'J'] });
  });

  it('keeps an empty combination, which means no shortcut', () => {
    expect(parseShortcutOverrides({ toggleControlWheel: [] })).toEqual({ toggleControlWheel: [] });
  });

  it('accepts a function key alone', () => {
    expect(parseShortcutOverrides({ toggleControlWheel: ['F9'] })).toEqual({ toggleControlWheel: ['F9'] });
  });

  it.each([
    ['not an array', 'ctrl+J'],
    ['more than four parts', ['ctrl', 'alt', 'shift', 'J', 'K']],
    ['a part over 16 characters', ['ctrl', 'AVeryLongKeyNameIndeed']],
    ['an empty part', ['ctrl', '']],
    ['a part that is not text', ['ctrl', 7]],
    ['modifiers only', ['ctrl', 'shift']],
  ])('drops a combination that is %s', (_description, combination) => {
    expect(parseShortcutOverrides({ toggleControlWheel: combination })).toEqual({});
  });

  it('keeps the valid overrides when others are invalid', () => {
    const saved = { toggleControlWheel: ['ctrl', 'shift', 'J'], somethingElse: 'broken' };

    expect(parseShortcutOverrides(saved)).toEqual({ toggleControlWheel: ['ctrl', 'shift', 'J'] });
  });

  it.each([undefined, null, 'ctrl+J', ['ctrl', 'J']])('reads %s as no overrides', (saved) => {
    expect(parseShortcutOverrides(saved)).toEqual({});
  });
});
