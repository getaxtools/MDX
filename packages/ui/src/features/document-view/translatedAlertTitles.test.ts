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
      info: 'Info',
      todo: 'To do',
      abstract: 'Abstract',
      summary: 'Summary',
      success: 'Success',
      question: 'Question',
      failure: 'Failure',
      danger: 'Danger',
      bug: 'Bug',
      example: 'Example',
      quote: 'Quote',
    });
  });
});
