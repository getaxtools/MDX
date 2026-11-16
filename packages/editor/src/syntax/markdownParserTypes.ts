import type { markdown } from '@codemirror/lang-markdown';

// @lezer/markdown is not a direct dependency, so its types come from the language's configuration.
type MarkdownExtension = NonNullable<NonNullable<Parameters<typeof markdown>[0]>['extensions']>;

export type MarkdownConfig = Exclude<MarkdownExtension, readonly unknown[]>;
export type BlockParser = NonNullable<MarkdownConfig['parseBlock']>[number];
export type InlineParser = NonNullable<MarkdownConfig['parseInline']>[number];
export type BlockContext = Parameters<NonNullable<BlockParser['parse']>>[0];
export type Line = Parameters<NonNullable<BlockParser['parse']>>[1];
export type InlineContext = Parameters<InlineParser['parse']>[0];
export type ParseWrapper = NonNullable<MarkdownConfig['wrap']>;
export type ParseInput = Parameters<ParseWrapper>[1];
export type SyntaxElement = Parameters<BlockContext['addElement']>[0];
