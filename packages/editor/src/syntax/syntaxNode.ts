import type { syntaxTree } from '@codemirror/language';

/** A node of the editor's syntax tree; @lezer/common is not a direct dependency, so its type comes from here. */
export type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;
