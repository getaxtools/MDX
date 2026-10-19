import createDOMPurify from 'dompurify';
import type { BrowserWindow } from './createHtmlSanitizer';

export interface GeneratedContentSanitizer {
  /** KaTeX output: HTML and MathML whose layout relies on inline styles. */
  readonly sanitizeMath: (html: string) => string;
}

const FORBIDDEN_TAGS = [
  'script',
  'style',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'form',
  'a',
  'image',
];

/**
 * Sanitizes again what KaTeX generates from document text, because a document controls its input.
 * Style attributes are allowed here only, since KaTeX needs them for layout.
 */
export function createGeneratedContentSanitizer(window: BrowserWindow): GeneratedContentSanitizer {
  const purifier = createDOMPurify(window);
  return {
    sanitizeMath: (html) =>
      purifier.sanitize(html, {
        USE_PROFILES: { html: true, mathMl: true },
        ADD_ATTR: ['style'],
        FORBID_TAGS: FORBIDDEN_TAGS,
        FORBID_ATTR: ['href', 'xlink:href', 'src'],
        ALLOW_DATA_ATTR: false,
      }),
  };
}
