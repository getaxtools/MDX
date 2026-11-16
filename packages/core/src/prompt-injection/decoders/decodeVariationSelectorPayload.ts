const FIRST_VARIATION_SELECTOR = 0xfe00;
const LAST_VARIATION_SELECTOR = 0xfe0f;
const FIRST_SUPPLEMENTARY_SELECTOR = 0xe0100;
const LAST_SUPPLEMENTARY_SELECTOR = 0xe01ef;
const BYTES_IN_FIRST_BLOCK = 16;
const HEXADECIMAL = 16;
const MIN_READABLE_SHARE = 0.8;
const UNREADABLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}�]/u;

/**
 * Turns selectors back into the bytes they hide: VS1-VS16 carry the values 0-15 and VS17-VS256 carry
 * 16-255, the encoding used by published emoji smuggling tools.
 */
export function decodeVariationSelectorBytes(codePoints: readonly number[]): Uint8Array {
  const bytes: number[] = [];
  for (const codePoint of codePoints) {
    if (codePoint >= FIRST_VARIATION_SELECTOR && codePoint <= LAST_VARIATION_SELECTOR)
      bytes.push(codePoint - FIRST_VARIATION_SELECTOR);
    else if (codePoint >= FIRST_SUPPLEMENTARY_SELECTOR && codePoint <= LAST_SUPPLEMENTARY_SELECTOR)
      bytes.push(codePoint - FIRST_SUPPLEMENTARY_SELECTOR + BYTES_IN_FIRST_BLOCK);
  }
  return Uint8Array.from(bytes);
}

/** The bytes as text when they are readable UTF-8, otherwise as hexadecimal. */
export function describeBytes(bytes: Uint8Array): string {
  const text = readableUtf8(bytes);
  if (text !== undefined) return text;
  return [...bytes].map((byte) => byte.toString(HEXADECIMAL).padStart(2, '0')).join(' ');
}

export function readableUtf8(bytes: Uint8Array): string | undefined {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const characters = Array.from(text);
  if (characters.length === 0) return undefined;
  const readableCount = characters.filter((character) => isReadable(character)).length;
  return readableCount / characters.length >= MIN_READABLE_SHARE ? text : undefined;
}

function isReadable(character: string): boolean {
  return character === '\n' || character === '\t' || !UNREADABLE.test(character);
}

export function decodeVariationSelectorPayload(codePoints: readonly number[]): string {
  return describeBytes(decodeVariationSelectorBytes(codePoints));
}
