/** Documents over 1 MB of file size are edited in Source, so Rich text stays within its memory budget. */
export const MAX_RICH_TEXT_DOCUMENT_BYTES = 1_048_576;

const LARGEST_ONE_BYTE_CODE = 0x7f;
const LARGEST_TWO_BYTE_CODE = 0x7ff;
const LARGEST_THREE_BYTE_CODE = 0xffff;
const FOUR_BYTES = 4;
const THREE_BYTES = 3;

/** The size of the text in UTF-8, counted without encoding a copy of it. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= LARGEST_ONE_BYTE_CODE) bytes += 1;
    else if (code <= LARGEST_TWO_BYTE_CODE) bytes += 2;
    else bytes += code <= LARGEST_THREE_BYTE_CODE ? THREE_BYTES : FOUR_BYTES;
  }
  return bytes;
}

export function isTooLargeForRichText(text: string): boolean {
  return text.length > MAX_RICH_TEXT_DOCUMENT_BYTES || utf8ByteLength(text) > MAX_RICH_TEXT_DOCUMENT_BYTES;
}
