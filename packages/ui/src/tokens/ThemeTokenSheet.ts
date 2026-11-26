import { THEME_COLOR_SCHEMES, type ThemePreference } from '@mdx/core';

export type AppTheme = Exclude<ThemePreference, 'system'>;

export const APP_THEMES = Object.keys(THEME_COLOR_SCHEMES) as AppTheme[];

const OUTSIDE_MEDIA = '';

interface CssRule {
  readonly media: string;
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** The custom properties a stylesheet declares, read by theme and by media query. */
export class ThemeTokenSheet {
  private constructor(private readonly rules: readonly CssRule[]) {}

  static parse(css: string): ThemeTokenSheet {
    return new ThemeTokenSheet(cssRulesOf(css));
  }

  /** The tokens a theme ends up with outside any media query: the light base, the dark base for dark themes, then its own. */
  tokensOf(theme: AppTheme): ReadonlyMap<string, string> {
    const selectors = [':root'];
    if (THEME_COLOR_SCHEMES[theme] === 'dark') selectors.push(":root[data-color-scheme='dark']");
    selectors.push(`:root[data-theme='${theme}']`);
    return this.declarationsFor(OUTSIDE_MEDIA, selectors);
  }

  tokenOf(theme: AppTheme, name: string): string {
    const value = this.tokensOf(theme).get(name);
    if (!value) throw new Error(`${theme} has no ${name}`);
    return value;
  }

  /** The tokens of the rules inside `media` (empty for none) that match any of `selectors`, later rules winning. */
  declarationsFor(media: string, selectors: readonly string[]): ReadonlyMap<string, string> {
    const matching = this.rules.filter(
      (rule) =>
        rule.media === media && rule.selector.split(',').some((part) => selectors.includes(part.trim())),
    );
    return new Map(matching.flatMap((rule) => [...rule.declarations]));
  }
}

function cssRulesOf(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const openBlocks: string[] = [];
  for (const [, prelude = '', brace] of css.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)([{}])/g)) {
    if (brace === '{') {
      openBlocks.push(prelude.trim());
      continue;
    }
    const selector = openBlocks.pop() ?? '';
    const media = openBlocks.find((block) => block.startsWith('@media')) ?? OUTSIDE_MEDIA;
    if (!selector.startsWith('@')) rules.push({ media, selector, declarations: declarationsOf(prelude) });
  }
  return rules;
}

function declarationsOf(body: string): Map<string, string> {
  const declarations = body
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter(([name]) => name?.trim().startsWith('--'))
    .map(([name = '', ...value]): [string, string] => [name.trim(), value.join(':').trim()]);
  return new Map(declarations);
}
