import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { translatedAlertTitles } from './translatedAlertTitles';

describe('translatedAlertTitles', () => {
  it('names every kind of alert from the catalog', () => {
    expect(translatedAlertTitles(createTranslator())).toEqual({
      note: 'Note',
      tip: 'Tip',
      important: 'Important',
      warning: 'Warning',
      caution: 'Caution',
    });
  });
});
