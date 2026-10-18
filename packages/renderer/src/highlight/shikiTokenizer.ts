import githubDark from '@shikijs/themes/github-dark-high-contrast';
import githubLight from '@shikijs/themes/github-light-high-contrast';
import { createHighlighterCore, type HighlighterCore, type ThemedTokenWithVariants } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, bundledLanguagesAlias } from 'shiki/langs';
import type { HighlightedLine, HighlightedToken } from './createCodeHighlighter';

const ITALIC_FONT_STYLE = 1;
const BOLD_FONT_STYLE = 2;

let highlighter: Promise<HighlighterCore> | undefined;

export async function tokenizeCode(
  code: string,
  languageName: string,
): Promise<HighlightedLine[] | undefined> {
  const loadLanguage = languageLoaderFor(languageName);
  if (!loadLanguage) return undefined;
  highlighter ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  const core = await highlighter;
  try {
    await core.loadLanguage(loadLanguage);
    const lines = core.codeToTokensWithThemes(code, {
      lang: languageName,
      themes: {
        light: githubLight.name ?? 'github-light-high-contrast',
        dark: githubDark.name ?? 'github-dark-high-contrast',
      },
    });
    return lines.map((line) => line.map(toHighlightedToken));
  } catch {
    return undefined;
  }
}

function languageLoaderFor(languageName: string) {
  if (Object.hasOwn(bundledLanguages, languageName)) {
    return bundledLanguages[languageName as keyof typeof bundledLanguages];
  }
  return bundledLanguagesAlias[languageName];
}

function toHighlightedToken({ content, variants }: ThemedTokenWithVariants): HighlightedToken {
  const fontStyle = variants.light?.fontStyle ?? 0;
  return {
    text: content,
    ...(variants.light?.color ? { lightColor: variants.light.color } : {}),
    ...(variants.dark?.color ? { darkColor: variants.dark.color } : {}),
    isItalic: (fontStyle & ITALIC_FONT_STYLE) !== 0,
    isBold: (fontStyle & BOLD_FONT_STYLE) !== 0,
  };
}
