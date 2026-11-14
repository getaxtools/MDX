import { describe, expect, it } from 'vitest';
import { expandTemplate } from '../snippets/expandSnippet';
import { formatDate } from './formatDate';

const THURSDAY = new Date(2026, 10, 12, 9, 5, 7);

describe('formatDate', () => {
  it('formats numbers with leading zeros', () => {
    expect(formatDate(THURSDAY, 'YYYY-MM-DD HH:mm:ss', 'en')).toBe('2026-11-12 09:05:07');
  });

  it('formats dddd D MMMM in the app language', () => {
    expect(formatDate(THURSDAY, 'dddd D MMMM', 'en')).toBe('Thursday 12 November');
    expect(formatDate(THURSDAY, 'dddd D MMMM', 'de')).toBe('Donnerstag 12 November');
  });
});

describe('expandTemplate', () => {
  const context = { now: THURSDAY, locale: 'en-GB', title: 'Weekly review' };

  it('fills title, date and time', () => {
    expect(expandTemplate('# {{title}}\n{{date}} {{time}}', context)).toBe(
      '# Weekly review\n12/11/2026 09:05',
    );
  });

  it('formats a date with its own format', () => {
    expect(expandTemplate('{{date:dddd D MMMM}}', context)).toBe('Thursday 12 November');
  });

  it('unknown variables stay', () => {
    expect(expandTemplate('{{mood}}', context)).toBe('{{mood}}');
  });
});
