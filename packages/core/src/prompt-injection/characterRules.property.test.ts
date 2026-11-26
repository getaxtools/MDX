import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from './DocumentStructure';
import type { InjectionFinding } from './InjectionCheck';
import { hiddenCharactersOf } from './matchers/scanHiddenCharacters';
import { Ruleset } from './Ruleset';
import { runInjectionCheck } from './runInjectionCheck';

const hiddenCharacters = hiddenCharactersOf(Ruleset.bundled());
const NO_STANDARD_MEANING = /[\p{Cn}\p{Co}\p{Cs}]/u;
const BLACK_FLAG = 0x1f3f4;
const LOW_SURROGATE = /[\uDC00-\uDFFF]/;

const LRE = '\u202A';
const RLE = '\u202B';
const LRO = '\u202D';
const RLO = '\u202E';
const PDF = '\u202C';
const LRI = '\u2066';
const RLI = '\u2067';
const FSI = '\u2068';
const PDI = '\u2069';

/** Any code point that no character rule looks at; '&' is left out so no character reference can form. */
const plainCharacter = fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }).filter((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    !hiddenCharacters.has(codePoint) &&
    !NO_STANDARD_MEANING.test(character) &&
    codePoint !== BLACK_FLAG &&
    character !== '&'
  );
});
const plainText = fc.array(plainCharacter, { maxLength: 60 }).map((characters) => characters.join(''));
const tagCharacter = fc
  .integer({ min: 0xe0000, max: 0xe007f })
  .map((codePoint) => String.fromCodePoint(codePoint));

function findingsOf(text: string, segments: readonly DocumentSegment[] = []): readonly InjectionFinding[] {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings;
}

function insertAtCodePoint(
  text: string,
  inserted: string,
  codePointIndex: number,
): { text: string; offset: number } {
  const characters = Array.from(text);
  const index = codePointIndex % (characters.length + 1);
  const offset = characters.slice(0, index).join('').length;
  return { text: text.slice(0, offset) + inserted + text.slice(offset), offset };
}

type BidiPiece = string;

/** Well-nested pieces such as RLI x LRE y PDF PDI, balanced by construction. */
const balancedBidi: fc.Arbitrary<BidiPiece> = fc.letrec<{ balanced: BidiPiece }>((tie) => ({
  balanced: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constantFrom('', 'x', 'name'),
    fc.tuple(fc.constantFrom(LRE, RLE, LRO, RLO), tie('balanced')).map(([open, inner]) => open + inner + PDF),
    fc.tuple(fc.constantFrom(LRI, RLI, FSI), tie('balanced')).map(([open, inner]) => open + inner + PDI),
    fc.tuple(tie('balanced'), tie('balanced')).map(([first, second]) => first + second),
  ),
})).balanced;

describe('character rules (properties)', () => {
  it('report nothing for text without any listed code point', () => {
    fc.assert(
      fc.property(plainText, (text) => {
        expect(findingsOf(text)).toEqual([]);
      }),
    );
  });

  it('always report an inserted tag character at its offset', () => {
    fc.assert(
      fc.property(plainText, tagCharacter, fc.nat(), (text, tag, position) => {
        const inserted = insertAtCodePoint(text, tag, position);

        const findings = findingsOf(inserted.text).filter(
          (finding) => finding.ruleId === 'char-unicode-tags',
        );

        expect(
          findings.some((finding) => finding.from <= inserted.offset && inserted.offset < finding.to),
        ).toBe(true);
      }),
    );
  });

  it('report a line for unclosed direction controls if and only if it is unbalanced', () => {
    fc.assert(
      fc.property(balancedBidi, fc.nat(), (balanced, removedIndex) => {
        const closers = [...balanced.matchAll(/[\u202C\u2069]/g)].map((match) => match.index);
        const unbalancedFindings = (text: string) =>
          findingsOf(text).filter((finding) => finding.ruleId === 'char-bidi-unbalanced');

        expect(unbalancedFindings(balanced)).toEqual([]);
        if (closers.length === 0) return;
        const removed = closers[removedIndex % closers.length] ?? 0;
        expect(unbalancedFindings(balanced.slice(0, removed) + balanced.slice(removed + 1))).toHaveLength(1);
      }),
    );
  });

  it('keep every range inside the text, on code point boundaries and on the right line and column', () => {
    const hiddenSample = fc.constantFrom(
      '\u200B',
      '\u{E0041}\u{E0042}',
      '\u202E',
      '\u001b[0m',
      '\u2800',
      '\u{F0000}',
    );
    const line = fc
      .tuple(plainText, hiddenSample, plainText)
      .map(([before, hidden, after]) => before + hidden + after);
    const document = fc.record({
      hasByteOrderMark: fc.boolean(),
      hasFrontMatter: fc.boolean(),
      lineEnding: fc.constantFrom('\n', '\r\n', '\r'),
      lines: fc.array(fc.oneof(line, plainText), { minLength: 1, maxLength: 8 }),
    });

    fc.assert(
      fc.property(document, ({ hasByteOrderMark, hasFrontMatter, lineEnding, lines }) => {
        const frontMatter = hasFrontMatter ? ['---', 'title: Sample', '---'] : [];
        const text = (hasByteOrderMark ? '\uFEFF' : '') + [...frontMatter, ...lines].join(lineEnding);
        const lineStarts = [
          0,
          ...[...text.matchAll(/\r\n|\r|\n/g)].map((match) => match.index + match[0].length),
        ];

        for (const finding of findingsOf(text)) {
          const expectedLine = lineStarts.filter((start) => start <= finding.from).length - 1;
          expect(finding.from).toBeGreaterThanOrEqual(0);
          expect(finding.to).toBeLessThanOrEqual(text.length);
          expect(LOW_SURROGATE.test(text.charAt(finding.from))).toBe(false);
          expect(LOW_SURROGATE.test(text.charAt(finding.to))).toBe(false);
          expect(finding.line).toBe(expectedLine);
          expect(finding.column).toBe(finding.from - (lineStarts[expectedLine] ?? 0));
        }
      }),
    );
  });

  it('are pure and total: any text gives the same findings twice without throwing', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 400 }), (text) => {
        const first = findingsOf(text);

        expect(findingsOf(text)).toEqual(first);
      }),
    );
  });
});
