import createDOMPurify from 'dompurify';
import { HEADING_ID_PREFIX } from '../plugins/headingAnchorsPlugin';
import { SOURCE_LINE_ATTRIBUTE } from '../plugins/sourceLinesPlugin';

export type ResourceUrlResolver = (relativeUrl: string) => string | undefined;

export type LinkKind = 'external' | 'anchor' | 'document';

const FORBIDDEN_TAGS = [
  'style',
  'form',
  'button',
  'select',
  'option',
  'textarea',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'base',
  'link',
  'meta',
  'dialog',
  'template',
];
const FORBIDDEN_ATTRIBUTES = ['style', 'target', 'srcset', 'formaction', 'ping'];
const EXTERNAL_LINK = /^(https?:|mailto:)/i;
const REMOTE_URL = /^(https?:)?\/\//i;
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const LINE_NUMBER = /^\d{1,9}$/;

const SELF_CHECK_HTML = '<p>safe</p><script>unsafe()</script><img src="x.png" onerror="unsafe()">';

export class UnsafeSanitizerEnvironmentError extends Error {
  constructor() {
    super('The HTML sanitizer does not work correctly in this environment; refusing to render.');
    this.name = 'UnsafeSanitizerEnvironmentError';
  }
}

export type BrowserWindow = Window & typeof globalThis;

export interface SanitizeOptions {
  /** Keeps the source line markers the renderer put on blocks, for a preview beside the editor. */
  readonly keepSourceLines?: boolean;
}

export type HtmlSanitizer = (
  html: string,
  resolveResourceUrl?: ResourceUrlResolver,
  options?: SanitizeOptions,
) => string;

export function createHtmlSanitizer(window: BrowserWindow): HtmlSanitizer {
  const purifier = createDOMPurify(window);
  // Some DOM implementations report support but let scripts through; fail closed instead of rendering unsafely.
  assertSanitizerWorks(purifier.sanitize(SELF_CHECK_HTML));
  return (html, resolveResourceUrl, options = {}) => {
    const fragment = purifier.sanitize(html, {
      FORBID_TAGS: FORBIDDEN_TAGS,
      FORBID_ATTR: FORBIDDEN_ATTRIBUTES,
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: options.keepSourceLines === true ? [SOURCE_LINE_ATTRIBUTE] : [],
      RETURN_DOM_FRAGMENT: true,
    });
    keepOnlyLineNumbersAsSourceLines(fragment);
    keepOnlyPrefixedIds(fragment);
    keepOnlyDisabledCheckboxes(fragment);
    classifyLinks(fragment);
    resolveImages(fragment, resolveResourceUrl);
    const container = window.document.createElement('div');
    container.append(fragment);
    return container.innerHTML;
  };
}

function assertSanitizerWorks(sanitizedSelfCheck: string): void {
  const isSafe = sanitizedSelfCheck.includes('<p>safe</p>') && !/script|onerror/i.test(sanitizedSelfCheck);
  if (!isSafe) throw new UnsafeSanitizerEnvironmentError();
}

// Raw HTML in a document may carry the same attribute; only plain line numbers are trusted.
function keepOnlyLineNumbersAsSourceLines(fragment: DocumentFragment): void {
  for (const element of fragment.querySelectorAll(`[${SOURCE_LINE_ATTRIBUTE}]`)) {
    if (!LINE_NUMBER.test(String(element.getAttribute(SOURCE_LINE_ATTRIBUTE)))) {
      element.removeAttribute(SOURCE_LINE_ATTRIBUTE);
    }
  }
}

function keepOnlyPrefixedIds(fragment: DocumentFragment): void {
  for (const element of fragment.querySelectorAll('[name]')) element.removeAttribute('name');
  for (const element of fragment.querySelectorAll('[id]')) {
    if (!element.id.startsWith(HEADING_ID_PREFIX)) element.removeAttribute('id');
  }
}

function keepOnlyDisabledCheckboxes(fragment: DocumentFragment): void {
  for (const input of fragment.querySelectorAll('input')) {
    if (input.getAttribute('type')?.toLowerCase() === 'checkbox') input.setAttribute('disabled', '');
    else input.remove();
  }
}

function classifyLinks(fragment: DocumentFragment): void {
  for (const link of fragment.querySelectorAll('a')) {
    const href = link.getAttribute('href');
    if (href === null) continue;
    const kind = linkKindOf(href);
    if (!kind) {
      link.removeAttribute('href');
      continue;
    }
    link.setAttribute('data-mdx-link', kind);
    if (kind === 'external') link.setAttribute('rel', 'noopener noreferrer');
  }
}

function linkKindOf(href: string): LinkKind | undefined {
  if (EXTERNAL_LINK.test(href)) return 'external';
  if (href.startsWith('#')) return 'anchor';
  if (REMOTE_URL.test(href) || HAS_SCHEME.test(href)) return undefined;
  return 'document';
}

function resolveImages(
  fragment: DocumentFragment,
  resolveResourceUrl: ResourceUrlResolver | undefined,
): void {
  for (const image of fragment.querySelectorAll('img')) {
    const source = image.getAttribute('src');
    if (source === null || source.startsWith('data:image/')) continue;
    image.removeAttribute('src');
    if (REMOTE_URL.test(source)) {
      image.setAttribute('data-mdx-blocked-src', source);
      continue;
    }
    const resolvedSource = HAS_SCHEME.test(source) ? undefined : resolveResourceUrl?.(source);
    if (resolvedSource) image.setAttribute('src', resolvedSource);
  }
}
