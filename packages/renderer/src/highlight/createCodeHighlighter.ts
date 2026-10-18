export interface HighlightedToken {
  readonly text: string;
  readonly lightColor?: string;
  readonly darkColor?: string;
  readonly isItalic: boolean;
  readonly isBold: boolean;
}

export type HighlightedLine = readonly HighlightedToken[];

export interface CodeHighlighter {
  /** Returns the code split into coloured tokens, or undefined when the language is unknown. */
  highlight(code: string, language: string): Promise<readonly HighlightedLine[] | undefined>;
}

export const MAX_HIGHLIGHTED_CODE_LENGTH = 100_000;

export function createCodeHighlighter(): CodeHighlighter {
  return {
    async highlight(code, language) {
      if (code.length > MAX_HIGHLIGHTED_CODE_LENGTH) return undefined;
      // Loaded on first use so the highlighter and its grammars never slow down start-up.
      const { tokenizeCode } = await import('./shikiTokenizer');
      return tokenizeCode(code, language.toLowerCase());
    },
  };
}
