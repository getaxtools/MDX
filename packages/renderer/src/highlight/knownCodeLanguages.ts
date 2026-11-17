/** Code blocks named like this show as plain text, which is what the writer meant. */
const PLAIN_TEXT_LANGUAGES = ['text', 'txt', 'plain', 'plaintext'];

/**
 * The code block languages the app highlights, with their aliases, in lower case. Loaded on demand,
 * as the language list comes with the highlighter.
 */
export async function knownCodeLanguages(): Promise<readonly string[]> {
  const { bundledLanguages, bundledLanguagesAlias } = await import('shiki/langs');
  return [
    ...Object.keys(bundledLanguages),
    ...Object.keys(bundledLanguagesAlias),
    ...PLAIN_TEXT_LANGUAGES,
  ].map((language) => language.toLowerCase());
}
