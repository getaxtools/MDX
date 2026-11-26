import MarkdownIt from 'markdown-it';

/**
 * How a link's address is written: as a destination in `[text](…)` or in a reference definition, as
 * the inside of an autolink `<…>`, or as an address in running text that the preview links.
 */
export type WrittenLinkForm = 'destination' | 'autolink' | 'text';

export interface WrittenLink {
  /** Exactly as written in the document, angle brackets, escapes and entities included. */
  readonly destination: string;
  readonly form: WrittenLinkForm;
}

// The preview's options, so normalizing, entity decoding, link validation and linkify all match it.
const linkParser = new MarkdownIt({ html: true, linkify: true });

const MARKDOWN_OF_FORM: Readonly<Record<WrittenLinkForm, (destination: string) => string>> = {
  destination: (destination) => `[link](${destination})`,
  autolink: (destination) => `<${destination}>`,
  text: (destination) => destination,
};

/**
 * The href the preview gives a link written this way, found by letting markdown-it parse it as the
 * preview does: percent-encoded, with entities decoded and international hosts in punycode;
 * undefined when the preview would not make it a link.
 */
export function previewLinkHref({ destination, form }: WrittenLink): string | undefined {
  const [paragraph] = linkParser.parseInline(MARKDOWN_OF_FORM[form](destination), {});
  const linkOpen = paragraph?.children?.find((token) => token.type === 'link_open');
  const href = linkOpen?.attrGet('href');
  return typeof href === 'string' && href !== '' ? href : undefined;
}
