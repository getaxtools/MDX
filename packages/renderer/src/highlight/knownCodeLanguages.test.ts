import { describe, expect, it } from 'vitest';
import { knownCodeLanguages } from './knownCodeLanguages';

describe('knownCodeLanguages', () => {
  it('lists the highlighted languages with their aliases and plain text', async () => {
    const languages = await knownCodeLanguages();

    expect(languages).toEqual(expect.arrayContaining(['typescript', 'ts', 'rust', 'text']));
    expect(languages).not.toContain('query-lang');
  });
});
