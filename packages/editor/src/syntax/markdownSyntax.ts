import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { LanguageSupport } from '@codemirror/language';
import { FRONT_MATTER_SYNTAX } from './frontMatterSyntax';
import { MATH_SYNTAX } from './mathSyntax';
import { READING_AHEAD } from './readingAhead';

let sharedSyntax: LanguageSupport | undefined;

/**
 * GitHub Flavored Markdown with the preview's math and front matter, the language every editor and
 * every editor command parses with.
 */
export function markdownSyntax(): LanguageSupport {
  sharedSyntax ??= markdown({
    base: markdownLanguage,
    extensions: [READING_AHEAD, FRONT_MATTER_SYNTAX, MATH_SYNTAX],
  });
  return sharedSyntax;
}
