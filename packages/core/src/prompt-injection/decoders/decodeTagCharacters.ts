const TAG_BLOCK_START = 0xe0000;
const FIRST_PRINTABLE_TAG = 0xe0020;
const LAST_PRINTABLE_TAG = 0xe007e;

/** Reads the ASCII text that tag characters mirror; tags without a printable twin are left out. */
export function decodeTagCharacters(text: string): string {
  let decoded = '';
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= FIRST_PRINTABLE_TAG && codePoint <= LAST_PRINTABLE_TAG)
      decoded += String.fromCharCode(codePoint - TAG_BLOCK_START);
  }
  return decoded;
}
