const FIRST_SUPPLEMENTARY_CODE_POINT = 0x10000;
const FIRST_LOW_SURROGATE = 0xdc00;
const LAST_LOW_SURROGATE = 0xdfff;

export function codePointLength(codePoint: number): number {
  return codePoint >= FIRST_SUPPLEMENTARY_CODE_POINT ? 2 : 1;
}

/** The code point that ends just before the offset, reading a surrogate pair as one. */
export function codePointBefore(text: string, offset: number): number | undefined {
  if (offset <= 0) return undefined;
  const last = text.charCodeAt(offset - 1);
  const isLowSurrogate = last >= FIRST_LOW_SURROGATE && last <= LAST_LOW_SURROGATE;
  if (isLowSurrogate && offset >= 2) {
    const pair = text.codePointAt(offset - 2);
    if (pair !== undefined && pair >= FIRST_SUPPLEMENTARY_CODE_POINT) return pair;
  }
  return last;
}

export function codePointAfter(text: string, offset: number): number | undefined {
  return text.codePointAt(offset);
}
