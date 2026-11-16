import { describe, expect, it } from 'vitest';
import { listHiddenCharacters } from './listHiddenCharacters';

const FAMILY_EMOJI = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
const PERSIAN_WORD_WITH_ZWNJ = 'می\u200Cخواهم';
const FLAG_OF_ENGLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';

describe('listHiddenCharacters', () => {
  it('names each hidden character and gives its exact range', () => {
    expect(listHiddenCharacters('a\u200Db')).toEqual([
      {
        from: 1,
        to: 2,
        codePoint: 0x200d,
        name: 'ZERO WIDTH JOINER',
        abbreviation: 'ZWJ',
        isInSequence: false,
      },
    ]);
  });

  it('marks joiners inside an emoji family as part of a sequence', () => {
    const characters = listHiddenCharacters(`Family ${FAMILY_EMOJI}`);

    expect(characters).toHaveLength(2);
    expect(characters.every((character) => character.isInSequence)).toBe(true);
  });

  it('marks the non-joiner of a Persian word and the tags of a flag as part of a sequence', () => {
    const characters = listHiddenCharacters(`${PERSIAN_WORD_WITH_ZWNJ} ${FLAG_OF_ENGLAND}`);

    expect(characters.length).toBeGreaterThan(1);
    expect(characters.every((character) => character.isInSequence)).toBe(true);
  });

  it('keeps tag characters that hide text out of any sequence', () => {
    const characters = listHiddenCharacters('Hello\u{E0068}\u{E0069}');

    expect(characters.map((character) => character.isInSequence)).toEqual([false, false]);
  });

  it('lists nothing for text without hidden characters, tabs or line breaks', () => {
    expect(listHiddenCharacters('Plain\ttext\r\nwith lines')).toEqual([]);
  });
});
