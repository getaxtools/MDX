import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { formulaProblemAnnouncement, formulaProblemText } from './formulaProblemText';

const translator = createTranslator();
const MESSAGE = "Expected '}', got 'EOF' at end of input";

describe('formula problem text', () => {
  it('names the character the error is at, counted from 1', () => {
    expect(formulaProblemText({ kind: 'error', message: MESSAGE, position: 8 }, translator)).toBe(
      `Error at character 9: ${MESSAGE}`,
    );
  });

  it('announces the same error at another character with the same words, so it is not announced again', () => {
    const first = formulaProblemAnnouncement({ kind: 'error', message: MESSAGE, position: 8 }, translator);
    const later = formulaProblemAnnouncement({ kind: 'error', message: MESSAGE, position: 12 }, translator);

    expect(later).toBe(first);
  });

  it('says why a formula is not typeset at all', () => {
    expect(formulaProblemText({ kind: 'tooLong', limit: 10_000 }, translator)).toBe(
      'Formulas longer than 10,000 characters are not typeset.',
    );
    expect(formulaProblemText({ kind: 'unavailable' }, translator)).toBe('The preview is not available.');
    expect(formulaProblemText(undefined, translator)).toBe('');
  });
});
