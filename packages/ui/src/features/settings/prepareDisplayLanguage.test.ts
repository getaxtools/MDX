import { APP_STATE_SCHEMA_VERSION } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { prepareDisplayLanguage } from './prepareDisplayLanguage';

const savedWithLanguage = (language: string) => ({
  schemaVersion: APP_STATE_SCHEMA_VERSION,
  view: { language },
});

describe('prepareDisplayLanguage', () => {
  it('starts in English with left-to-right text when the system prefers an unsupported language', async () => {
    const root = document.createElement('html');

    const { locale, translator } = await prepareDisplayLanguage({
      savedState: undefined,
      systemLocales: ['sw-KE'],
      root,
    });

    expect(locale).toBe('en');
    expect(translator.translate('menu.file')).toBe('File');
    expect([root.lang, root.dir]).toEqual(['en', 'ltr']);
  });

  it('uses the language chosen in Settings and mirrors the page for right-to-left languages', async () => {
    const root = document.createElement('html');

    const { locale, messages } = await prepareDisplayLanguage({
      savedState: savedWithLanguage('ar-XB'),
      systemLocales: ['en-US'],
      root,
    });

    expect(locale).toBe('ar-XB');
    expect(messages['menu.file']).toBe('\u202EFile\u202C');
    expect([root.lang, root.dir]).toEqual(['ar-XB', 'rtl']);
  });
});
