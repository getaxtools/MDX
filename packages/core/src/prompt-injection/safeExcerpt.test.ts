import { describe, expect, it } from 'vitest';
import { Ruleset } from './Ruleset';
import { MAX_EXCERPT_LENGTH, safeDisplayText, safeExcerpt } from './safeExcerpt';
import { TextPositions } from './TextPositions';

function excerptOf(text: string, from: number, to: number): string {
  return safeExcerpt({ text, positions: TextPositions.of(text), ruleset: Ruleset.bundled() }, { from, to });
}

describe('safeExcerpt', () => {
  it('shows invisible characters as labelled markers', () => {
    expect(excerptOf('ign\u200Bore', 3, 4)).toBe('ign⟨ZWSP⟩ore');
  });

  it('joins a run of the same hidden character into one marker with a count', () => {
    const tags = Array.from({ length: 23 }, () => '\u{E0041}').join('');

    expect(excerptOf(`Hi${tags}`, 2, 2 + tags.length)).toBe('Hi⟨TAG×23⟩');
  });

  it('replaces direction controls, so the excerpt reads in stored order', () => {
    expect(excerptOf('user \u202E// admin\u202C', 5, 6)).toBe('user ⟨RLO⟩// admin⟨PDF⟩');
  });

  it('keeps markup as plain characters for the panel to show as text', () => {
    expect(excerptOf('<b>\u200B</b>', 3, 4)).toBe('<b>⟨ZWSP⟩</b>');
  });

  it('names code points that have no label by their number', () => {
    expect(excerptOf('icon \uE0A0', 5, 6)).toBe('icon ⟨U+E0A0⟩');
  });

  it('stays on the line of the finding', () => {
    expect(excerptOf('first\nsec\u200Bond\nthird', 9, 10)).toBe('sec⟨ZWSP⟩ond');
  });

  it(`never exceeds ${String(MAX_EXCERPT_LENGTH)} characters and marks what it cut`, () => {
    const longLine = `${'a'.repeat(200)}\u200B${'b'.repeat(200)}`;

    const excerpt = excerptOf(longLine, 200, 201);

    expect(Array.from(excerpt).length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
    expect(excerpt).toMatch(/^…a+⟨ZWSP⟩b+…$/);
  });

  it('shows the start of a finding that is longer than the limit', () => {
    const payload = Array.from({ length: 300 }, (_, index) => (index % 2 === 0 ? '\u200B' : '\u200C')).join(
      '',
    );

    const excerpt = excerptOf(payload, 0, payload.length);

    expect(excerpt.startsWith('⟨ZWSP⟩⟨ZWNJ⟩')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(Array.from(excerpt).length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
  });

  it('never cuts a surrogate pair in the context', () => {
    const text = `${'\u{1F600}'.repeat(30)}\u200B`;

    const excerpt = excerptOf(text, text.length - 1, text.length);

    expect(excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });
});

describe('safeDisplayText', () => {
  it('shows direction and invisible characters in decoded text as markers', () => {
    expect(safeDisplayText('reply\u202E <b>CANARY</b>\u200B')).toBe('reply⟨RLO⟩ <b>CANARY</b>⟨ZWSP⟩');
  });

  it(`cuts long text to ${String(MAX_EXCERPT_LENGTH)} characters`, () => {
    const shown = safeDisplayText('x'.repeat(500));

    expect(Array.from(shown)).toHaveLength(MAX_EXCERPT_LENGTH);
    expect(shown.endsWith('…')).toBe(true);
  });
});
