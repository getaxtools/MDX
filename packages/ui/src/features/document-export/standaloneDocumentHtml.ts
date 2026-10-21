import type { Typography } from '@mdx/core';
import documentCss from '../../tokens/document.css?inline';
import tokensCss from '../../tokens/tokens.css?inline';

export interface StandaloneDocument {
  readonly title: string;
  readonly locale: string;
  readonly typography: Typography;
  /** The rendered document, already sanitized and without the app's own controls. */
  readonly bodyHtml: string;
}

/** Nothing in an exported file may run or load from the network, even if it is opened in a browser. */
const EXPORT_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
const EXPORT_STYLES = `${tokensCss}\n${documentCss}\nbody { background: var(--color-background); }`;

/** A single HTML file that shows the document as MDX does, with its styles inside. */
export function standaloneDocumentHtml(
  { title, locale, typography, bodyHtml }: StandaloneDocument,
  styles: string = EXPORT_STYLES,
): string {
  return [
    '<!doctype html>',
    `<html lang="${escapeAttribute(locale)}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CONTENT_SECURITY_POLICY}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="MDX - Markdown Explorer">',
    `<title>${escapeText(title)}</title>`,
    `<style>${styles.replaceAll('</style', '<\\/style')}</style>`,
    '</head>',
    '<body>',
    `<article class="rendered-document" data-typography="${escapeAttribute(typography)}">`,
    bodyHtml,
    '</article>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replaceAll('"', '&quot;');
}
