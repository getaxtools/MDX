import type { Env, MarkdownIt } from 'markdown-it';

export const SOURCE_LINE_ATTRIBUTE = 'data-mdx-source-line';

export type SourceLinesEnvironment = Env & {
  /** Set to mark each block with the source line it starts on, for a preview that scrolls with the editor. */
  sourceLineOffset?: number;
};

/** Marks block elements with the zero-based line of the full document where they start. */
export function sourceLinesPlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.push('mdx_source_lines', (state) => {
    const { sourceLineOffset } = state.env as SourceLinesEnvironment;
    if (sourceLineOffset === undefined) return;
    for (const token of state.tokens) {
      if (!token.block || !token.map || token.nesting === -1 || token.type === 'inline') continue;
      token.attrSet(SOURCE_LINE_ATTRIBUTE, String(token.map[0] + sourceLineOffset));
    }
  });
}
