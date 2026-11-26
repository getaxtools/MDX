import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { runInjectionCheck } from '../runInjectionCheck';

const ZWSP = '\u200B';
const ZWNJ = '\u200C';
const ZWJ = '\u200D';
const BOM = '\uFEFF';
const INVISIBLE_TIMES = '\u2062';

function zeroWidthFindingsOf(text: string, segments: readonly DocumentSegment[] = []) {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings.filter(
    (finding) => finding.ruleId === 'char-zero-width',
  );
}

describe('char-zero-width', () => {
  it('reports a zero-width space inside an English word as Medium, covering the character', () => {
    const [finding] = zeroWidthFindingsOf(`ign${ZWSP}ore`);

    expect(finding).toMatchObject({ severity: 'medium', from: 3, to: 4 });
  });

  it('does not report the joiners of an emoji family', () => {
    const family = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}${ZWJ}\u{1F466}`;

    expect(zeroWidthFindingsOf(`Our ${family} trip`)).toEqual([]);
  });

  it('does not report joiners after skin tones and presentation selectors', () => {
    const technologist = `\u{1F469}\u{1F3FD}${ZWJ}\u{1F4BB}`;
    const rainbowFlag = `\u{1F3F3}\uFE0F${ZWJ}\u{1F308}`;

    expect(zeroWidthFindingsOf(`${technologist} ${rainbowFlag}`)).toEqual([]);
  });

  it('does not report the non-joiners of Persian words', () => {
    const persian = `می${ZWNJ}خواهم کتاب${ZWNJ}ها`;

    expect(zeroWidthFindingsOf(persian)).toEqual([]);
  });

  it('does not report Devanagari and Malayalam conjunct joiners', () => {
    const devanagari = `क्${ZWJ}ष क्${ZWNJ}ष`;
    const malayalam = `ന്${ZWJ}`;

    expect(zeroWidthFindingsOf(`${devanagari} ${malayalam}ന`)).toEqual([]);
  });

  it('does not report a word-final Malayalam chillu joiner', () => {
    expect(zeroWidthFindingsOf(`അവന്${ZWJ} പോയി`)).toEqual([]);
  });

  it('reports a joiner between Latin letters, or between a joining script and a Latin letter', () => {
    expect(zeroWidthFindingsOf(`a${ZWJ}b`)).toHaveLength(1);
    expect(zeroWidthFindingsOf(`क्${ZWJ}x`)).toHaveLength(1);
  });

  it('does not report a byte order mark at the start of the file, but reports one later', () => {
    expect(zeroWidthFindingsOf(`${BOM}# Title`)).toEqual([]);
    expect(zeroWidthFindingsOf(`# Ti${BOM}tle`)).toHaveLength(1);
  });

  it('does not report invisible math operators inside math', () => {
    const text = `$a${INVISIBLE_TIMES}b$`;
    const segments: DocumentSegment[] = [{ kind: 'math', range: { from: 0, to: text.length } }];

    expect(zeroWidthFindingsOf(text, segments)).toEqual([]);
    expect(zeroWidthFindingsOf(`a${INVISIBLE_TIMES}b`)).toHaveLength(1);
  });

  it('lists a zero-width space between Thai or Japanese letters as Info, a word-break hint', () => {
    const [thai] = zeroWidthFindingsOf(`สวัส${ZWSP}ดี`);
    const [japanese] = zeroWidthFindingsOf(`日本${ZWSP}語`);

    expect(thai?.severity).toBe('info');
    expect(japanese?.severity).toBe('info');
  });

  it('reports a run of eight or more zero-width characters as High', () => {
    const [finding] = zeroWidthFindingsOf(`hello${ZWSP.repeat(8)}world`);

    expect(finding).toMatchObject({ severity: 'high', from: 5, to: 13 });
  });

  it('reports two zero-width characters alternating like binary as High', () => {
    const [finding] = zeroWidthFindingsOf(`hi${ZWSP}${ZWNJ}${ZWNJ}${ZWSP}there`);

    expect(finding?.severity).toBe('high');
  });
});
